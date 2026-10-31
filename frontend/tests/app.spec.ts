import { expect, test, type Page } from '@playwright/test'
import type { Job, Profile } from '../src/types'
import { remotePlan } from './fixtures/remote-plan'

// 前端默认走后端（Vite 代理 /backend）；端到端用夹具替代真实模型，保证离线可重复
test.beforeEach(async ({ page }) => {
  await page.route('**/backend/api/plan', async route => {
    const body = route.request().postDataJSON() as { profile: Profile; jobs: Job[]; version: number }
    await route.fulfill({ json: { plan: remotePlan(body.profile, body.jobs, body.version) } })
  })
  await page.route('**/backend/api/llm/status', route => route.fulfill({ json: { configured: false, model: '' } }))
})

async function completeWizard(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '载入演示画像' }).click()
  await expect(page.getByRole('heading', { name: '先从现在的你开始' })).toBeVisible()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '继续选择岗位样本' }).click()
  await expect(page.getByRole('heading', { name: '让规划，从岗位依据开始' })).toBeVisible()
}

test('桌面完整任务、导出、12→6 小时调整与历史版本保护', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await completeWizard(page)
  await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  await page.getByRole('checkbox', { name: /标记完成/ }).first().check()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出计划' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('学途-成长计划-V1.md')
  await page.getByRole('link', { name: '调整方案', exact: true }).click()
  await page.getByRole('tab', { name: '调整成长方案' }).click()
  await page.getByRole('button', { name: '一键演示：每周 12 小时改为 6 小时' }).click()
  await expect(page.getByText('新方案已保存，原方案未修改。')).toBeVisible()
  await page.getByRole('button', { name: /^全部/ }).click()
  await expect(page.locator('.change-card').first()).toBeVisible()
  const snapshots = await page.evaluate(() => JSON.parse(localStorage.getItem('pathpilot-workspace')!).plans.map((p: { profile: { hours: number } }) => p.profile.hours))
  expect(snapshots).toEqual([6, 12])
  await page.getByRole('link', { name: '历史计划', exact: true }).click()
  await expect(page.locator('.history-card')).toHaveCount(2)
  await page.goBack()
  await expect(page.getByRole('heading', { name: '让计划，跟上你的变化.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('手机端完成同一主流程，并可用折叠菜单导航', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await completeWizard(page)
  await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  await page.getByRole('link', { name: '调整方案', exact: true }).click()
  await page.getByRole('tab', { name: '调整成长方案' }).click()
  await page.getByRole('button', { name: '一键演示：每周 12 小时改为 6 小时' }).click()
  await expect(page.getByText('新方案已保存，原方案未修改。')).toBeVisible()
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await page.locator('#mobile-navigation').getByRole('link', { name: '历史计划' }).click()
  await expect(page.locator('.history-card')).toHaveCount(2)
})

test('查看岗位原文和导入操作不会提前提交画像向导', async ({ page }) => {
  await completeWizard(page)
  await page.getByRole('button', { name: '查看招聘原文' }).first().click()
  await expect(page).toHaveURL(/#\/plan/)
  await expect(page.getByRole('heading', { name: '让规划，从岗位依据开始' })).toBeVisible()
  await page.getByRole('button', { name: '导入岗位', exact: true }).click()
  await page.getByLabel('岗位名称').fill('测试岗位')
  await page.getByLabel(/招聘要求原文/).fill('掌握 Vue、JavaScript 和 Git。')
  await page.getByRole('button', { name: '添加并选中' }).click()
  await expect(page).toHaveURL(/#\/plan/)
  await expect(page.getByRole('checkbox', { name: '选择 测试岗位 用户导入' })).toBeChecked()
})

test('草稿刷新后恢复；损坏的本地记录可重置', async ({ page }) => {
  await page.goto('/#/plan')
  await page.getByLabel('你的专业').fill('软件工程')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '你想靠近哪一种工作？' })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('pathpilot-workspace', '{broken'))
  await page.reload()
  await expect(page.getByText(/上次的本地记录无法读取/)).toBeVisible()
  await page.getByRole('button', { name: '重置本地记录' }).click()
  await expect(page.getByRole('heading', { name: '先从现在的你开始' })).toBeVisible()
})

test('键盘跳到主要内容时仍停留在当前页面', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '跳到主要内容' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: /从目标岗位出发/ })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main')
})

test('手机输入区域不会被下一步操作栏覆盖', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/#/plan')
  const field = page.getByLabel(/已修课程/)
  await field.scrollIntoViewIfNeeded()
  expect(await field.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return hit === element
  })).toBe(true)
})

test('打开旧方案的岗位依据时不会混入当前草稿的另一岗位', async ({ page }) => {
  await completeWizard(page)
  await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  await page.goto('/#/analysis')
  await page.getByRole('button', { name: 'Python 后端', exact: true }).click()
  await page.getByRole('button', { name: '生成成长路线' }).click()
  await page.goto('/#/history')
  await page.locator('.history-card').last().getByRole('button', { name: '查看这份路线' }).click()
  await page.locator('.item-details').evaluateAll(nodes =>
    nodes.forEach(node => node.setAttribute('open', '')),
  )
  await page.getByRole('link', { name: '查看岗位依据' }).first().click()
  await expect(page.locator('.skill-stat')).toContainText(['JavaScript'])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pathpilot-workspace')!).profile.role)).toBe('backend')
})

test('全部代表宽度的首页、向导、分析、路线与对比均无页面横向溢出', async ({ page }) => {
  await completeWizard(page)
  await page.getByRole('button', { name: '分析岗位并生成路线' }).click()
  await expect(page.getByRole('heading', { name: '你的成长，有路可循.' })).toBeVisible()
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const route of ['/', '/plan', '/analysis', '/roadmap', '/adjust', '/history']) {
      await page.goto(`/#${route}`)
      await expect(page.locator('main')).toBeVisible()
      await page.locator('h1').first().waitFor()
      if (route === '/analysis') await page.locator('.skill-chart svg').waitFor()
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }))
      expect(dimensions.scroll, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
      if ([390, 768, 1440].includes(width) && ['/', '/plan', '/analysis', '/roadmap', '/adjust'].includes(route)) await page.screenshot({ path: `output/screenshots/${width}-${route.slice(1) || 'home'}.png`, fullPage: true })
    }
  }
})

test('模型设置：保存密钥后页头显示已接入模型', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.demo-badge')).toHaveText('演示模式')

  await page.getByRole('button', { name: '模型设置' }).click()
  const dialog = page.getByRole('dialog', { name: '接入 AI' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('DeepSeek 密钥').fill('sk-e2e-test')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog.getByText('已保存在本机浏览器')).toBeVisible()

  await dialog.getByRole('button', { name: '关闭模型设置' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.demo-badge')).toHaveText('已接入模型')

  const stored = await page.evaluate(() => localStorage.getItem('pathpilot-llm'))
  expect(JSON.parse(stored!)).toEqual({ key: 'sk-e2e-test', model: '' })

  await page.reload()
  await expect(page.locator('.demo-badge')).toHaveText('已接入模型')
})

test('模型设置：Esc 关闭并清除密钥', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() =>
    localStorage.setItem('pathpilot-llm', JSON.stringify({ key: 'sk-old', model: '' })),
  )
  await page.reload()
  await page.getByRole('button', { name: '模型设置' }).click()
  const dialog = page.getByRole('dialog', { name: '接入 AI' })

  await expect(dialog.getByLabel('DeepSeek 密钥')).toHaveValue('sk-old')
  await dialog.getByRole('button', { name: '清除' }).click()
  await expect(dialog.getByLabel('DeepSeek 密钥')).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('pathpilot-llm'))).toBeNull()
})
