import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('./api', () => ({
  remotePlanEnabled: vi.fn(),
  requestPlan: vi.fn(),
}))

import { remotePlanEnabled, requestPlan } from './api'
import { defaultProfile } from './data'
import { useWorkspace } from './store'
import type { Plan } from './types'
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
  setActivePinia(createPinia())
  vi.mocked(requestPlan).mockReset()
  vi.mocked(remotePlanEnabled).mockReturnValue(true)
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
