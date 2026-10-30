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
})
