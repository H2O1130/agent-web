import { afterEach, describe, expect, it, vi } from 'vitest'

function memoryStorage(seed?: string) {
  const data = new Map<string, string>()
  if (seed !== undefined) data.set('pathpilot-llm', seed)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    dump: (key: string) => data.get(key) ?? null,
  }
}

async function loadLlm(seed?: string) {
  const storage = memoryStorage(seed)
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  const llm = await import('./llm')
  return { llm, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('llm settings', () => {
  it('默认没有密钥', async () => {
    const { llm } = await loadLlm()

    expect(llm.hasLlmKey.value).toBe(false)
    expect(llm.llmHeaders()).toEqual({})
  })

  it('保存后写入本机存储并生成请求头', async () => {
    const { llm, storage } = await loadLlm()

    llm.saveLlmSettings({ key: '  sk-test  ', model: ' deepseek-chat ' })

    expect(llm.hasLlmKey.value).toBe(true)
    expect(llm.llmSettings.value).toEqual({ key: 'sk-test', model: 'deepseek-chat' })
    expect(JSON.parse(storage.dump('pathpilot-llm')!)).toEqual({
      key: 'sk-test',
      model: 'deepseek-chat',
    })
    expect(llm.llmHeaders()).toEqual({
      'X-DeepSeek-Key': 'sk-test',
      'X-DeepSeek-Model': 'deepseek-chat',
    })
  })

  it('启动时读取已保存的配置', async () => {
    const { llm } = await loadLlm(JSON.stringify({ key: 'sk-saved', model: '' }))

    expect(llm.hasLlmKey.value).toBe(true)
    expect(llm.llmHeaders()).toEqual({ 'X-DeepSeek-Key': 'sk-saved' })
  })

  it('存储内容损坏时回退为空配置', async () => {
    const { llm } = await loadLlm('{oops')

    expect(llm.llmSettings.value).toEqual({ key: '', model: '' })
  })

  it('清除后移除本机存储', async () => {
    const { llm, storage } = await loadLlm(JSON.stringify({ key: 'sk-saved', model: '' }))

    llm.clearLlmSettings()

    expect(llm.hasLlmKey.value).toBe(false)
    expect(storage.dump('pathpilot-llm')).toBeNull()
  })

  it('可针对未保存的密钥生成请求头', async () => {
    const { llm } = await loadLlm()

    expect(llm.llmHeaders({ key: 'sk-draft', model: '' })).toEqual({
      'X-DeepSeek-Key': 'sk-draft',
    })
  })
})
