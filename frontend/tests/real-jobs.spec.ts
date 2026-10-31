import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Job, Plan, Profile } from '../src/types'
import { remotePlan } from './fixtures/remote-plan'

interface CollectedJob {
  id: string
  role: string
  title: string
  company: string
  text: string
  source: 'collected'
  url: string
  collectedAt: string
  dataNotes: string[]
}

interface PlanPayload {
  profile: Profile
  jobs: Job[]
  version: number
}

interface Workspace {
  profile: Profile
  selectedIds: string[]
  jobs: Job[]
  plans: Plan[]
}

// Read JSON directly: Playwright's Node runner does not load Vite JSON modules.
const realJobs = JSON.parse(readFileSync(new URL('../src/data/jobs.real.json', import.meta.url), 'utf8')) as CollectedJob[]
const legacyJobs = JSON.parse(readFileSync(new URL('../src/data/jobs.json', import.meta.url), 'utf8')) as Job[]
const categoryCounts = {
  frontend: 5, backend: 5, product: 6, agent: 6, llm: 5,
  data: 6, embedded: 6, testing: 6, devops: 5,
}
const pythonIds = ['nc-462212', 'nc-432841', 'nc-460588']

async function completeWizard(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '载入演示画像' }).click()
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole('button', { name: '下一步', exact: true }).click()
  }
  await page.getByRole('button', { name: '继续选择岗位样本' }).click()
  await expect(page.getByRole('heading', { name: '让规划，从岗位依据开始' })).toBeVisible()
}

async function workspace(page: Page): Promise<Workspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pathpilot-workspace')!))
}

function card(page: Page, job: CollectedJob): Locator {
  return page.locator('.job-card').filter({
    has: page.getByRole('checkbox', { name: `选择 ${job.title} ${job.company}`, exact: true }),
  })
}

async function verifyOriginal(page: Page, job: CollectedJob) {
  const item = card(page, job)
  await expect(item).toContainText('真实采集')
  await item.getByRole('button', { name: '查看招聘原文' }).click()
  const original = item.locator('.job-original')
  // textContent retains the source's line breaks and punctuation exactly.
  expect(await original.locator('p').first().textContent()).toBe(job.text)
  await expect(original.getByRole('link')).toHaveAttribute('href', job.url)
  await expect(original).toContainText(job.collectedAt)
  for (const note of job.dataNotes) await expect(original).toContainText(note)
}

async function mockPlanning(page: Page) {
  const calls: PlanPayload[] = []
  await page.route('**/backend/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/backend/health') {
      await route.fulfill({ json: { status: 'ok' } })
      return
    }
    if (path === '/backend/api/llm/status') {
      await route.fulfill({ json: { configured: false, model: '' } })
      return
    }
    if (path === '/backend/api/plan' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as PlanPayload
      calls.push(payload)
      await route.fulfill({ json: { plan: remotePlan(payload.profile, payload.jobs, payload.version) } })
      return
    }
    await route.abort('failed')
    throw new Error(`Unexpected backend request: ${route.request().method()} ${path}`)
  })
  return calls
}

test('默认展示全部 50 条真实样本，九类筛选计数准确且仅真实前端五条被选中', async ({ page }) => {
  await completeWizard(page)
  const category = page.getByLabel('岗位分类', { exact: true })
  await expect(category).toBeVisible()
  await expect(category.locator('option')).toHaveCount(10)
  await expect(category.locator('option').first()).toContainText('全部')
  await expect(page.locator('.job-card')).toHaveCount(50)
  const initial = await workspace(page)
  expect(initial.profile.role).toBe('frontend')
  expect([...initial.selectedIds].sort()).toEqual(realJobs.filter(job => job.role === 'frontend').map(job => job.id).sort())
  expect(await page.locator('.job-card input:checked').count()).toBe(5)
  expect(await page.locator('.job-card input[type="checkbox"]').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value).sort()))
    .toEqual(realJobs.map(job => job.id).sort())
  await expect(page.locator('.job-list')).not.toContainText('演示样本')
  await page.getByRole('button', { name: '取消全选', exact: true }).click()
  await expect(page.locator('.job-card input:checked')).toHaveCount(0)
  await page.getByRole('button', { name: '选择全部', exact: true }).click()
  await expect(page.locator('.job-card input:checked')).toHaveCount(5)
  for (const job of realJobs.filter(item => item.role !== 'frontend')) {
    await expect(card(page, job).getByRole('checkbox')).toBeDisabled()
  }

  for (const [role, count] of Object.entries(categoryCounts)) {
    await category.selectOption(role)
    await expect(page.locator('.job-card')).toHaveCount(count)
    for (const job of realJobs.filter(item => item.role === role)) await expect(card(page, job)).toBeVisible()
    expect((await workspace(page)).profile).toEqual(initial.profile)
    expect((await workspace(page)).selectedIds).toEqual(initial.selectedIds)
  }
})

test('产品与 Agent 目录可展开真实原文和来源，无法误选或改变画像', async ({ page }) => {
  await completeWizard(page)
  const before = await workspace(page)
  for (const role of ['product', 'agent']) {
    await page.getByLabel('岗位分类', { exact: true }).selectOption(role)
    await expect(page.locator('.job-card')).toHaveCount(6)
    for (const job of realJobs.filter(item => item.role === role)) {
      await expect(card(page, job).getByRole('checkbox')).toBeDisabled()
      await expect(card(page, job).getByRole('checkbox')).not.toBeChecked()
    }
    await verifyOriginal(page, realJobs.find(job => job.role === role)!)
    expect((await workspace(page)).profile).toEqual(before.profile)
    expect((await workspace(page)).selectedIds).toEqual(before.selectedIds)
  }
  await page.getByLabel('岗位分类', { exact: true }).selectOption('frontend')
  await verifyOriginal(page, realJobs.find(job => job.dataNotes.length > 0 && job.role === 'frontend')!)
})

test('岗位洞察的后端目录显示五条，但 Python 规划全选仅提交三条兼容岗位', async ({ page }) => {
  const calls = await mockPlanning(page)
  await completeWizard(page)
  await page.goto('/#/analysis')
  await page.getByRole('button', { name: 'Python 后端', exact: true }).click()
  await page.getByRole('button', { name: /浏览岗位库/ }).click()
  await page.getByLabel('岗位分类', { exact: true }).selectOption('backend')
  await expect(page.locator('.job-card')).toHaveCount(5)
  for (const job of realJobs.filter(item => item.role === 'backend')) {
    const checkbox = card(page, job).getByRole('checkbox')
    if (pythonIds.includes(job.id)) {
      await expect(checkbox).toBeEnabled()
      await expect(checkbox).toBeChecked()
    } else {
      await expect(checkbox).toBeDisabled()
      await expect(checkbox).not.toBeChecked()
      await expect(card(page, job)).toContainText(/Python/)
    }
  }
  await page.getByRole('button', { name: '取消全选', exact: true }).click()
  await expect(page.locator('.job-card input:checked')).toHaveCount(0)
  await page.getByRole('button', { name: '选择全部', exact: true }).click()
  await expect(page.locator('.job-card input:checked')).toHaveCount(3)
  await page.getByRole('button', { name: '生成成长路线', exact: true }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(calls[0]!.profile.role).toBe('backend')
  expect(calls[0]!.jobs.map(job => job.id).sort()).toEqual([...pythonIds].sort())
  for (const excluded of ['nc-469522', 'nc-458051']) {
    expect(calls[0]!.jobs.map(job => job.id)).not.toContain(excluded)
  }
})

test('真实前端原文以 imported 兼容接口出站，原始 ID、文本与链接不变且界面保持真实采集', async ({ page }) => {
  const calls = await mockPlanning(page)
  await completeWizard(page)
  await page.getByRole('button', { name: '分析岗位并生成路线', exact: true }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  expect(calls).toHaveLength(1)
  const expected = realJobs.filter(job => job.role === 'frontend')
  expect(calls[0]!.jobs).toHaveLength(5)
  for (const original of expected) {
    expect(calls[0]!.jobs.find(job => job.id === original.id)).toMatchObject({
      id: original.id, title: original.title, role: 'frontend', source: 'imported',
      text: original.text, url: original.url, collectedAt: original.collectedAt,
    })
  }
  expect((await workspace(page)).plans[0]!.jobIds.sort()).toEqual(expected.map(job => job.id).sort())
  await page.goto('/#/analysis')
  await page.getByRole('button', { name: /浏览岗位库/ }).click()
  await page.getByLabel('岗位分类', { exact: true }).selectOption('frontend')
  await expect(page.locator('.job-card')).toHaveCount(5)
  for (const original of expected) await expect(card(page, original)).toContainText('真实采集')
  await expect(page.locator('.job-list')).not.toContainText('用户导入')
})

for (const role of ['frontend', 'backend'] as const) {
  test(`旧 ${role === 'frontend' ? 'fe' : 'be'} 历史岗位依据仍可查看，并完整保留原方案与旧 jobIds`, async ({ page }) => {
    const jobs = legacyJobs.filter(job => job.role === role)
    const historical = remotePlan(undefined, jobs)
    historical.id = `legacy-${role}`
    historical.profile.role = role
    const draft = { ...historical.profile, role: role === 'frontend' ? 'backend' : 'frontend' } as Profile
    await page.addInitScript(saved => localStorage.setItem('pathpilot-workspace', JSON.stringify(saved)), {
      profile: draft, jobs: [], selectedIds: [], plans: [historical], activeId: historical.id,
      completed: {}, step: 6, hasDraft: true,
    })
    await page.goto('/#/history')
    await page.getByRole('button', { name: '查看这份路线' }).click()
    await page.locator('.item-details').first().evaluate(element => element.setAttribute('open', ''))
    await page.getByRole('link', { name: '查看岗位依据' }).first().click()
    await expect(page.getByText(/正在查看 V1 的岗位依据/)).toBeVisible()
    await expect(page.locator('.analysis-summary')).toContainText('6')
    await page.getByRole('tab', { name: '学历条件', exact: true }).click()
    for (const job of jobs) await expect(page.locator('.evidence-list')).toContainText(job.id)
    const after = await workspace(page)
    expect(after.plans).toEqual([historical])
    expect(after.profile).toEqual(draft)
    expect(after.plans[0]!.jobIds).toEqual(jobs.map(job => job.id))
  })
}

test('旧前端计划同向调整后选中的历史演示仍可见、核对原文并全部取消', async ({ page }) => {
  await mockPlanning(page)
  const legacyFrontend = legacyJobs.filter(job => job.role === 'frontend')
  const historical = remotePlan(undefined, legacyFrontend)
  historical.id = 'legacy-adjust-frontend'
  await page.addInitScript(saved => localStorage.setItem('pathpilot-workspace', JSON.stringify(saved)), {
    profile: historical.profile,
    jobs: [], selectedIds: realJobs.filter(job => job.role === 'frontend').map(job => job.id),
    plans: [historical], activeId: historical.id, completed: {}, step: 6, hasDraft: true,
  })
  await page.goto('/#/adjust')
  await page.getByRole('tab', { name: '调整成长方案', exact: true }).click()
  await page.getByLabel('调整每周小时', { exact: true }).fill('6')
  await page.getByRole('button', { name: '按这些条件重新生成', exact: true }).click()
  await expect(page.getByText('新方案已保存，原方案未修改。')).toBeVisible()
  expect((await workspace(page)).selectedIds).toEqual(legacyFrontend.map(job => job.id))
  await page.getByRole('link', { name: '岗位洞察', exact: true }).click()
  await page.getByRole('button', { name: /浏览岗位库/ }).click()
  for (const job of legacyFrontend) {
    const checkbox = page.getByRole('checkbox', { name: `选择 ${job.title} ${job.company}`, exact: true })
    await expect(checkbox).toBeVisible()
    await expect(checkbox).toBeChecked()
    await expect(page.locator('.job-card').filter({ has: checkbox })).toContainText('历史演示')
  }
  const first = legacyFrontend[0]!
  const firstCard = page.locator('.job-card').filter({
    has: page.getByRole('checkbox', { name: `选择 ${first.title} ${first.company}`, exact: true }),
  })
  await firstCard.getByRole('button', { name: '查看招聘原文' }).click()
  expect(await firstCard.locator('.job-original p').first().textContent()).toBe(first.text)
  // Historical selections remain reversible after the real catalog migration.
  await page.getByRole('button', { name: '选择全部', exact: true }).click()
  await expect(page.locator('.job-card input:checked')).toHaveCount(11)
  await page.getByRole('button', { name: '取消全选', exact: true }).click()
  expect((await workspace(page)).selectedIds).toEqual([])
  await expect(page.locator('.job-card')).toHaveCount(50)
  await expect(page.locator('.job-list')).not.toContainText('历史演示')
  expect((await workspace(page)).plans[1]).toEqual(historical)
})

test('320px 分类选择、长岗位标题、原文与来源完整可用且页面无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await completeWizard(page)
  const category = page.getByLabel('岗位分类', { exact: true })
  const longest = [...realJobs].sort((a, b) => b.title.length - a.title.length)[0]!
  await category.selectOption(longest.role)
  await expect(card(page, longest)).toBeVisible()
  await verifyOriginal(page, longest)
  for (const target of [category, card(page, longest), card(page, longest).locator('.job-original')]) {
    const bounds = await target.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  }
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: Array.from(document.querySelectorAll('body *')).flatMap(element => {
      const bounds = element.getBoundingClientRect()
      return bounds.width && bounds.right > innerWidth
        ? [{ tag: element.tagName, class: element.className, right: bounds.right, text: element.textContent?.slice(0, 100) }]
        : []
    }),
  }))
  expect(dimensions.scroll, JSON.stringify(dimensions.overflow)).toBeLessThanOrEqual(dimensions.viewport)
})
