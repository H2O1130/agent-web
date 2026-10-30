import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearChat, loadChat, saveChat } from './chatHistory'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    dump: () => data,
  }
}

const chat = [
  { role: 'assistant' as const, content: '先说说你想改什么' },
  { role: 'user' as const, content: '把 Python 换成 Java' },
]

describe('对话记录', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('存了就能读回来，并记住属于哪一版方案', () => {
    saveChat('plan-2', chat)

    expect(loadChat()).toEqual({ planId: 'plan-2', messages: chat })
  })

  it('没存过时返回 null', () => {
    expect(loadChat()).toBeNull()
  })

  it('清空后读不到', () => {
    saveChat('plan-1', chat)
    clearChat()

    expect(loadChat()).toBeNull()
  })

  it('只保留最近 80 条', () => {
    const many = Array.from({ length: 100 }, (_, index) => ({
      role: 'user' as const,
      content: `第 ${index} 句`,
    }))

    saveChat('plan-1', many)

    expect(loadChat()?.messages).toHaveLength(80)
    expect(loadChat()?.messages.at(-1)?.content).toBe('第 99 句')
  })

  it('空对话不覆盖已有记录', () => {
    saveChat('plan-1', chat)
    saveChat('plan-2', [])

    expect(loadChat()?.planId).toBe('plan-1')
  })

  it('格式坏掉时当作没有，不抛错', () => {
    localStorage.setItem('pathpilot-chat', '{坏掉的 json')
    expect(loadChat()).toBeNull()

    localStorage.setItem('pathpilot-chat', JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }))
    expect(loadChat()).toBeNull()
  })

  it('混进坏消息时丢掉坏的，留下好的', () => {
    localStorage.setItem(
      'pathpilot-chat',
      JSON.stringify({ planId: 'plan-3', messages: [{ role: 'user', content: '留着' }, { nope: true }] }),
    )

    expect(loadChat()).toEqual({
      planId: 'plan-3',
      messages: [{ role: 'user', content: '留着' }],
    })
  })
})
