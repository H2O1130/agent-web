import { describe, expect, it } from 'vitest'
import { DEFAULT_ADJUST_MODE, createModePicker } from './adjustMode'

describe('调整方式切换', () => {
  it('默认是第二个（和 AI 聊聊）', () => {
    expect(DEFAULT_ADJUST_MODE).toBe('ai')
  })

  it('单点第一个切到手动', () => {
    const pick = createModePicker()

    expect(pick('ai', 'manual', 1000)).toBe('manual')
  })

  it('单点第二个切回 AI', () => {
    const pick = createModePicker()

    expect(pick('manual', 'ai', 1000)).toBe('ai')
  })

  it('双击第一个回到默认的第二个', () => {
    const pick = createModePicker()
    const first = pick('ai', 'manual', 1000)
    const second = pick(first, 'manual', 1120)

    expect(first).toBe('manual')
    expect(second).toBe('ai')
  })

  it('连续多次点击仍然停在默认', () => {
    const pick = createModePicker()
    let mode = pick('ai', 'manual', 1000)
    mode = pick(mode, 'manual', 1100)
    mode = pick(mode, 'manual', 1200)
    mode = pick(mode, 'manual', 1300)

    expect(mode).toBe('ai')
  })

  it('间隔较久的两次点击仍算两次切换', () => {
    const pick = createModePicker()
    const first = pick('ai', 'manual', 1000)
    const second = pick(first, 'manual', 2000)

    expect(first).toBe('manual')
    expect(second).toBe('manual')
  })

  it('先切到手动再双击，也能回到默认', () => {
    const pick = createModePicker()
    let mode = pick('ai', 'manual', 1000)
    mode = pick(mode, 'manual', 1300)
    mode = pick(mode, 'manual', 1350)

    expect(mode).toBe('ai')
  })
})
