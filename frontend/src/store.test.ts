import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('./api', () => ({
  remotePlanEnabled: vi.fn(),
  requestPlan: vi.fn(),
}))

import { remotePlanEnabled, requestPlan } from './api'
import { defaultProfile, demoJobs } from './data'
import { useWorkspace } from './store'
import type { Job, Plan } from './types'
import { remotePlan } from '../tests/fixtures/remote-plan'

const plan: Plan = {
  id: 'remote-plan',
  version: 1,
  createdAt: '2026-10-29T00:00:00.000Z',
  profile: defaultProfile,
  jobIds: [],
  tasks: [],
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  vi.mocked(requestPlan).mockReset()
  vi.mocked(remotePlanEnabled).mockReturnValue(true)
})

afterEach(() => vi.unstubAllGlobals())

function memoryStorage(saved?: object) {
  const values = new Map<string, string>()
  if (saved) values.set('pathpilot-workspace', JSON.stringify(saved))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('真实岗位加载与旧记录兼容', () => {
  it('新工作区、载入画像和重置都选择真实前端岗位', () => {
    const store = useWorkspace()
    expect(store.jobs.filter(job => job.source === 'collected')).toHaveLength(50)
    expect(store.selectedIds).toHaveLength(5)
    expect(store.selectedIds.every(id => id.startsWith('nc-'))).toBe(true)
    store.selectedIds = []
    store.loadDemo()
    expect(store.selectedIds).toHaveLength(5)
    store.reset()
    expect(store.selectedIds).toHaveLength(5)
  })

  it('刷新时迁移演示草稿选择，旧计划的岗位编号和内容保持原样', () => {
    const old = remotePlan(defaultProfile, demoJobs.slice(0, 1), 3)
    vi.stubGlobal('localStorage', memoryStorage({
      profile: defaultProfile, jobs: [], plans: [old], selectedIds: ['fe-01', 'fe-02'], activeId: old.id,
    }))
    const store = useWorkspace()
    expect(store.selectedIds).toHaveLength(5)
    expect(store.selectedIds.every(id => id.startsWith('nc-'))).toBe(true)
    expect(store.plans[0]).toEqual(old)
    expect(store.jobs.find(job => job.id === old.jobIds[0])?.text).toBe(demoJobs[0]!.text)
  })

  it('恢复用户导入和主动取消选择，不重复静态真实目录', () => {
    const imported: Job = { ...demoJobs[0]!, id: 'import-owned', source: 'imported' }
    vi.stubGlobal('localStorage', memoryStorage({ profile: defaultProfile, jobs: [imported], plans: [], selectedIds: [] }))
    const store = useWorkspace()
    expect(store.selectedIds).toEqual([])
    expect(store.jobs.filter(job => job.id === imported.id)).toHaveLength(1)
    expect(store.jobs.filter(job => job.source === 'collected')).toHaveLength(50)
  })

  it.each([
    { role: 'frontend' as const, legacyId: 'fe-01', expectedIds: ['nc-467328', 'nc-467408', 'nc-464866', 'nc-463664', 'nc-456510'] },
    { role: 'backend' as const, legacyId: 'be-01', expectedIds: ['nc-462212', 'nc-432841', 'nc-460588'] },
  ])('混合草稿迁移：$role 替换旧演示样本并保留用户导入选择', ({ role, legacyId, expectedIds }) => {
    const profile = { ...defaultProfile, role }
    const legacy = demoJobs.find(job => job.id === legacyId)!
    const imported: Job = { ...legacy, id: 'import-owned', source: 'imported' }
    const historical = remotePlan(profile, [legacy], 3)
    vi.stubGlobal('localStorage', memoryStorage({
      profile, jobs: [imported], plans: [historical],
      selectedIds: [legacyId, imported.id], activeId: historical.id,
    }))

    const store = useWorkspace()

    expect([...store.selectedIds].sort()).toEqual([...expectedIds, imported.id].sort())
    expect(store.selectedJobs.every(job => job.source !== 'demo')).toBe(true)
    expect(store.jobs.find(job => job.id === imported.id)).toEqual(imported)
    expect(store.plans).toEqual([historical])
  })

  it('不能把其他目录方向或Java岗位混入当前规划', async () => {
    const store = useWorkspace()
    await expect(store.generate(store.profile, ['nc-469522'])).rejects.toThrow('没有对应的规划模板')
    expect(requestPlan).not.toHaveBeenCalled()
  })

  it('选中的样本以其他方向为主时提示暂无路线模板', async () => {
    const store = useWorkspace()
    const productIds = store.jobs.filter(job => job.role === 'product').map(job => job.id)
    expect(productIds.length).toBeGreaterThan(0)

    await expect(store.generate(store.profile, productIds)).rejects.toThrow('暂时还没有路线模板')
    expect(requestPlan).not.toHaveBeenCalled()
  })

  it('混选时按占多数的方向反推，少数方向只作分析样本', async () => {
    vi.mocked(requestPlan).mockResolvedValue(plan)
    const store = useWorkspace()
    const productId = store.jobs.find(job => job.role === 'product')!.id

    await store.generate(store.profile, [...store.selectedIds, productId])

    const [requestedProfile, requestedIds] = vi.mocked(requestPlan).mock.calls[0]!
    expect(requestedProfile.role).toBe('frontend')
    expect(requestedIds).not.toContain(productId)
    expect(requestedIds).toHaveLength(store.selectedIds.length)
  })
})

describe('store.generate', () => {
  it('远程模式下保存返回的方案', async () => {
    vi.mocked(requestPlan).mockResolvedValue(plan)
    const store = useWorkspace()

    const result = await store.generate(store.profile, store.selectedIds)

    expect(requestPlan).toHaveBeenCalledTimes(1)
    expect(result).toBe(plan)
    expect(store.activeId).toBe('remote-plan')
    expect(store.plans[0]).toEqual(plan)
    expect(store.generating).toBe(false)
  })

  it('远程失败时抛出提示并恢复状态', async () => {
    vi.mocked(requestPlan).mockRejectedValue(new Error('规划服务响应超时，请稍后重试。'))
    const store = useWorkspace()

    await expect(store.generate(store.profile, store.selectedIds)).rejects.toThrow('规划服务响应超时')

    expect(store.generating).toBe(false)
    expect(store.plans).toHaveLength(0)
  })

  it('生成过程中修改输入，不改变已经提交的请求快照', async () => {
    let finish!: (value: Plan) => void
    vi.mocked(requestPlan).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const store = useWorkspace()
    const pending = store.generate(store.profile, store.selectedIds)
    store.profile.hours = 6
    store.selectedIds.splice(0)

    expect(vi.mocked(requestPlan).mock.calls[0]![0].hours).toBe(12)
    const returned = remotePlan({ ...defaultProfile, hours: 12 })
    finish(returned)
    await pending
    expect(store.plans[0]!.profile.hours).toBe(12)
    expect(store.profile.hours).toBe(6)
    expect(store.stale).toBe(true)
  })

  it('生成后端请求未结束时再次点击不会重复请求', async () => {
    let finish!: (value: Plan) => void
    vi.mocked(requestPlan).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const store = useWorkspace()
    const pending = store.generate(store.profile, store.selectedIds)
    await expect(store.generate(store.profile, store.selectedIds)).rejects.toThrow('正在生成')
    expect(requestPlan).toHaveBeenCalledTimes(1)
    finish(remotePlan())
    await pending
  })

  it('工作区重置后忽略旧请求，不能把已清空的计划写回来', async () => {
    let finish!: (value: Plan) => void
    vi.mocked(requestPlan).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const store = useWorkspace()
    const result = store.generate(store.profile, store.selectedIds).catch(error => error as Error)
    store.reset()
    finish(remotePlan())
    expect(await result).toHaveProperty('message', expect.stringContaining('已重置'))
    expect(store.plans).toHaveLength(0)
    expect(store.activeId).toBe('')
    expect(store.generating).toBe(false)
  })
})
