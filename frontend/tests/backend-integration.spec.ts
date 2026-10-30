import { expect, test, type Page, type Route } from '@playwright/test'
import type { Job, Plan, Profile } from '../src/types'
import { remotePlan } from './fixtures/remote-plan'

test.use({ baseURL: process.env.PATHPILOT_E2E_BASE_URL || 'http://127.0.0.1:5173' })

interface Settings {
  key: string
  model: string
  baseUrl?: string
}

interface PlanPayload {
  profile: Profile
  jobs: Job[]
  version: number
}

interface BackendCall {
  method: string
  path: string
  headers: Record<string, string>
  body: PlanPayload | null
}

interface Reply {
  status?: number
  body: unknown
}

interface Workspace {
  profile: Profile
  plans: Plan[]
  activeId: string
  completed: Record<string, string[]>
}

async function mockBackend(page: Page, handlers: {
  plan?: (payload: PlanPayload, call: number) => Reply | Promise<Reply>
  verify?: (route: Route) => Reply | Promise<Reply>
} = {}) {
  const calls: BackendCall[] = []
  let planCalls = 0
  await page.route('**/backend/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    calls.push({
      method: request.method(), path, headers: request.headers(),
      body: request.postData() ? request.postDataJSON() as PlanPayload : null,
    })
    let reply: Reply
    if (path === '/backend/health' && request.method() === 'GET') {
      reply = { body: { status: 'ok' } }
    } else if (path === '/backend/api/plan' && request.method() === 'POST') {
      const payload = request.postDataJSON() as PlanPayload
      planCalls += 1
      reply = handlers.plan
        ? await handlers.plan(payload, planCalls)
        : { body: { plan: remotePlan(payload.profile, payload.jobs, payload.version) } }
    } else if (path === '/backend/api/llm/verify' && request.method() === 'POST') {
      reply = handlers.verify
        ? await handlers.verify(route)
        : { body: { ok: true, model: 'deepseek-flash' } }
    } else {
      await route.abort('failed')
      throw new Error(`前端请求了未接入的后端接口：${request.method()} ${path}`)
    }
    await route.fulfill({ status: reply.status ?? 200, json: reply.body })
  })
  return calls
}

async function seedSettings(page: Page, settings: Settings) {
  await page.goto('/')
  await page.evaluate(value => localStorage.setItem('pathpilot-llm', JSON.stringify(value)), settings)
  await page.reload()
}

async function workspace(page: Page): Promise<Workspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pathpilot-workspace')!))
}

async function savedSettings(page: Page): Promise<Settings | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pathpilot-llm') ?? 'null'))
}

async function completeWizard(page: Page, customize?: () => Promise<void>) {
  await page.goto('/')
  await page.getByRole('button', { name: '载入演示画像' }).click()
  await expect(page.getByRole('heading', { name: '先从现在的你开始' })).toBeVisible()
  await customize?.()
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole('button', { name: '下一步', exact: true }).click()
  }
  await page.getByRole('button', { name: '继续选择岗位样本' }).click()
  await expect(page.getByRole('heading', { name: '让规划，从岗位依据开始' })).toBeVisible()
}

async function generate(page: Page) {
  await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: '模型设置' })
}

function modelInput(page: Page) {
  return dialog(page).getByPlaceholder('留空则使用服务端默认模型')
}

function baseUrlInput(page: Page) {
  return dialog(page).getByLabel(/模型服务地址|Base URL/i)
}

test('向导向规划接口提交原始画像和招聘原文，并展示返回的学期与假期', async ({ page }) => {
  const calls = await mockBackend(page)
  const settings = { key: 'sk-contract-key', model: 'contract-model', baseUrl: 'https://models.example.test/v1' }
  await seedSettings(page, settings)
  await completeWizard(page, async () => {
    await page.getByLabel('你的专业').fill('软件工程（接口联调）')
    await page.getByLabel(/已修课程/).fill('程序设计基础\n数据库原理')
  })
  await page.getByRole('button', { name: '取消全选', exact: true }).click()
  await page.getByRole('button', { name: '导入岗位', exact: true }).click()
  const originalText = '掌握 JavaScript、Git。\n保留原文：优先具备团队协作经验。'
  await page.getByLabel('岗位名称').fill('前端接口联调岗位')
  await page.getByLabel(/招聘要求原文/).fill(originalText)
  await page.getByLabel(/来源链接/).fill('https://jobs.example.test/frontend/42')
  await page.getByRole('button', { name: '添加并选中' }).click()
  expect(calls.filter(call => call.path === '/backend/api/plan')).toHaveLength(0)
  await generate(page)

  const requests = calls.filter(call => call.path === '/backend/api/plan')
  expect(requests).toHaveLength(1)
  const request = requests[0]!
  expect(request.method).toBe('POST')
  expect(request.headers).toMatchObject({
    'content-type': 'application/json', 'x-deepseek-key': settings.key,
    'x-deepseek-model': settings.model, 'x-deepseek-base-url': settings.baseUrl,
  })
  expect(request.body).toMatchObject({
    version: 1,
    profile: {
      major: '软件工程（接口联调）', semester: 3, role: 'frontend', hours: 12, path: 'job',
      courses: '程序设计基础\n数据库原理', skills: ['programming'],
      scores: { programming: 5, project: 3, analysis: 5, communication: 5 },
      interests: ['技术实现', '创意设计'],
    },
  })
  expect(request.body!.jobs).toHaveLength(1)
  expect(request.body!.jobs[0]).toMatchObject({
    id: expect.stringMatching(/^import-/), role: 'frontend', title: '前端接口联调岗位',
    text: originalText, source: 'imported', url: 'https://jobs.example.test/frontend/42',
  })
  await expect(page.locator('.semester-section.current-semester').getByRole('heading', { name: '基础阶段' })).toBeVisible()
  await expect(page.locator('.semester-section.vacation').getByRole('heading', { name: '寒假实践' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '完成校园应用原型' })).toBeVisible()
  expect((await workspace(page)).plans[0]!.id).toBe('remote-plan-1')
  await expect(page.locator('.demo-badge')).toHaveText('模型已连接')
})

test('调整时间仍调用规划接口，增加版本并保护旧方案和完成记录', async ({ page }) => {
  const calls = await mockBackend(page)
  await completeWizard(page)
  await generate(page)
  await page.getByRole('checkbox', { name: '标记完成：建立项目仓库', exact: true }).check()
  const before = await workspace(page)
  await page.getByRole('link', { name: '调整方案', exact: true }).click()
  await page.getByLabel('调整每周小时', { exact: true }).fill('6')
  await page.getByRole('button', { name: '调整成长方案', exact: true }).click()
  await expect(page.getByText('新方案已保存，原方案未修改。')).toBeVisible()

  const requests = calls.filter(call => call.path === '/backend/api/plan')
  expect(requests).toHaveLength(2)
  expect(requests.map(request => request.method)).toEqual(['POST', 'POST'])
  expect(requests[1]!.body).toEqual({
    profile: { ...requests[0]!.body!.profile, hours: 6 },
    jobs: requests[0]!.body!.jobs, version: 2,
  })
  const after = await workspace(page)
  expect(after.plans.map(plan => [plan.id, plan.version, plan.profile.hours])).toEqual([
    ['remote-plan-2', 2, 6], ['remote-plan-1', 1, 12],
  ])
  expect(after.plans[1]).toEqual(before.plans[0])
  expect(after.completed['remote-plan-1']).toEqual(['git-repo'])
  expect(after.activeId).toBe('remote-plan-2')
  await page.getByRole('link', { name: '历史计划', exact: true }).click()
  await expect(page.locator('.history-card')).toHaveCount(2)
})

for (const failure of [
  { status: 422, code: 'NO_SKILLS', message: '暂未识别到支持的技能，请补充岗位文本或选择示例样本。' },
  { status: 503, code: 'LLM_NOT_CONFIGURED', message: '规划服务未配置模型密钥。' },
]) {
  test(`${failure.code} 显示后端错误并保留草稿，不保存方案或静默使用本地结果`, async ({ page }) => {
    const calls = await mockBackend(page, {
      plan: () => ({ status: failure.status, body: { code: failure.code, message: failure.message } }),
    })
    await completeWizard(page)
    const before = await workspace(page)
    await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
    await expect(page.getByRole('alert')).toHaveText(failure.message)
    await expect(page).toHaveURL(/#\/plan$/)
    const after = await workspace(page)
    expect(after.plans).toEqual(before.plans)
    expect(after.activeId).toBe(before.activeId)
    expect(after.profile).toEqual(before.profile)
    expect(calls.filter(call => call.path === '/backend/api/plan')).toHaveLength(1)
    await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
    await expect(page.getByRole('button', { name: '分析岗位并生成路线' })).toBeEnabled()
  })
}

test('调整请求失败时旧方案和活动版本保持不变', async ({ page }) => {
  await mockBackend(page, {
    plan: (payload, call) => call === 1
      ? { body: { plan: remotePlan(payload.profile, payload.jobs, payload.version) } }
      : { status: 503, body: { code: 'LLM_NOT_CONFIGURED', message: '规划服务未配置模型密钥。' } },
  })
  await completeWizard(page)
  await generate(page)
  const before = await workspace(page)
  await page.getByRole('link', { name: '调整方案', exact: true }).click()
  await page.getByLabel('调整每周小时', { exact: true }).fill('6')
  await page.getByRole('button', { name: '调整成长方案', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('规划服务未配置模型密钥。')
  const after = await workspace(page)
  expect(after.plans).toEqual(before.plans)
  expect(after.activeId).toBe(before.activeId)
  expect(after.profile).toEqual(before.profile)
  await expect(page.getByText('新方案已保存，原方案未修改。')).toBeHidden()
})

test('健康检查成功和保存密钥都不能把未验证模型标为已连接', async ({ page }) => {
  const calls = await mockBackend(page)
  await page.goto('/')
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
  await page.getByRole('button', { name: '模型设置' }).click()
  await expect.poll(() => calls.filter(call => call.path === '/backend/health').length).toBe(1)
  expect(calls.find(call => call.path === '/backend/health')!.method).toBe('GET')
  expect(calls.filter(call => call.path === '/backend/api/llm/verify')).toHaveLength(0)
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
  await dialog(page).getByLabel('密钥', { exact: true }).fill('sk-saved-without-verification')
  await dialog(page).getByRole('button', { name: '保存', exact: true }).click()
  expect((await savedSettings(page))!.key).toBe('sk-saved-without-verification')
  await dialog(page).getByRole('button', { name: '关闭模型设置' }).click()
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
  await page.reload()
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
})

test('空密钥可验证服务端配置，验证只更新草稿，保存后才用于规划', async ({ page }) => {
  const calls = await mockBackend(page, { verify: () => ({ body: { ok: true, model: 'server-config-model' } }) })
  await page.goto('/')
  await page.getByRole('button', { name: '模型设置' }).click()
  await modelInput(page).fill('server-config-model')
  await dialog(page).getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(dialog(page).getByText('连接成功，保存后应用（server-config-model）。', { exact: true })).toBeVisible()
  const verify = calls.filter(call => call.path === '/backend/api/llm/verify')
  expect(verify).toHaveLength(1)
  expect(verify[0]!.method).toBe('POST')
  expect(verify[0]!.body).toBeNull()
  expect(verify[0]!.headers['x-deepseek-key']).toBeUndefined()
  expect(verify[0]!.headers['x-deepseek-model']).toBe('server-config-model')
  expect(await savedSettings(page)).toBeNull()
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
  await dialog(page).getByRole('button', { name: /^(保存|完成)$/ }).click()
  expect(await savedSettings(page)).toMatchObject({ key: '', model: 'server-config-model' })
  await dialog(page).getByRole('button', { name: '关闭模型设置' }).click()
  await expect(page.locator('.demo-badge')).toHaveText('模型已连接')
  await completeWizard(page)
  await generate(page)
  const plan = calls.find(call => call.path === '/backend/api/plan')!
  expect(plan.headers['x-deepseek-key']).toBeUndefined()
  expect(plan.headers['x-deepseek-model']).toBe('server-config-model')
})

test('验证使用三个草稿配置头，关闭未保存草稿后规划仍使用原配置', async ({ page }) => {
  const calls = await mockBackend(page, { verify: () => ({ body: { ok: true, model: 'draft-model' } }) })
  const applied = { key: 'sk-applied', model: 'applied-model', baseUrl: 'https://applied.example.test/v1' }
  await seedSettings(page, applied)
  await page.getByRole('button', { name: '模型设置' }).click()
  await dialog(page).getByLabel('密钥', { exact: true }).fill('sk-draft')
  await modelInput(page).fill('draft-model')
  await baseUrlInput(page).fill('https://draft.example.test/v1')
  await dialog(page).getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(dialog(page).getByRole('button', { name: '测试连接', exact: true })).toBeEnabled()
  const verify = calls.find(call => call.path === '/backend/api/llm/verify')!
  expect(verify.headers).toMatchObject({
    'x-deepseek-key': 'sk-draft', 'x-deepseek-model': 'draft-model',
    'x-deepseek-base-url': 'https://draft.example.test/v1',
  })
  expect(await savedSettings(page)).toEqual(applied)
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
  await dialog(page).getByRole('button', { name: '关闭模型设置' }).click()
  await completeWizard(page)
  await generate(page)
  expect(calls.find(call => call.path === '/backend/api/plan')!.headers).toMatchObject({
    'x-deepseek-key': applied.key, 'x-deepseek-model': applied.model,
    'x-deepseek-base-url': applied.baseUrl,
  })
})

test('关闭并重开设置后旧验证结果不会覆盖新的表单', async ({ page }) => {
  let release!: () => void
  let settled!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const finished = new Promise<void>(resolve => { settled = resolve })
  const calls: string[] = []
  await page.route('**/backend/health', route => route.fulfill({ json: { status: 'ok' } }))
  await page.route('**/backend/api/llm/verify', async route => {
    calls.push(route.request().method())
    await pending
    try {
      await route.fulfill({ json: { ok: true, model: 'stale-model' } })
    } catch {
      // Closing the dialog may intentionally abort its outstanding request.
    } finally {
      settled()
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '模型设置' }).click()
  await dialog(page).getByLabel('密钥', { exact: true }).fill('sk-first-draft')
  await modelInput(page).fill('first-model')
  await dialog(page).getByRole('button', { name: '测试连接', exact: true }).click()
  await expect.poll(() => calls.length).toBe(1)
  await dialog(page).getByRole('button', { name: '关闭模型设置' }).click()
  await page.getByRole('button', { name: '模型设置' }).click()
  await dialog(page).getByLabel('密钥', { exact: true }).fill('sk-second-draft')
  await modelInput(page).fill('second-model')
  await baseUrlInput(page).fill('https://second.example.test/v1')
  release()
  await finished
  await page.waitForLoadState('networkidle')
  await expect(dialog(page).getByLabel('密钥', { exact: true })).toHaveValue('sk-second-draft')
  await expect(modelInput(page)).toHaveValue('second-model')
  await expect(baseUrlInput(page)).toHaveValue('https://second.example.test/v1')
  await expect(dialog(page).getByRole('button', { name: '测试连接', exact: true })).toBeEnabled()
  await expect(dialog(page)).not.toContainText('stale-model')
  expect(await savedSettings(page)).toBeNull()
  await expect(page.locator('.demo-badge')).toHaveText('模型待验证')
})
