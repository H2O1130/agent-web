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

  it('保存模型服务地址后随请求发送，并兼容旧配置', async () => {
    const { llm, storage } = await loadLlm(JSON.stringify({ key: 'sk-old', model: '' }))

    expect(llm.llmHeaders()).toEqual({ 'X-DeepSeek-Key': 'sk-old' })
    llm.saveLlmSettings({
      key: ' sk-new ',
      model: ' custom-model ',
      baseUrl: ' https://models.example.com/v1 ',
    })

    expect(llm.llmHeaders()).toEqual({
      'X-DeepSeek-Key': 'sk-new',
      'X-DeepSeek-Model': 'custom-model',
      'X-DeepSeek-Base-URL': 'https://models.example.com/v1',
    })
    expect(JSON.parse(storage.dump('pathpilot-llm')!)).toEqual({
      key: 'sk-new',
      model: 'custom-model',
      baseUrl: 'https://models.example.com/v1',
    })
  })

  it('刷新后恢复模型服务地址但不恢复连接验证状态', async () => {
    const { llm } = await loadLlm(JSON.stringify({
      key: 'sk-saved',
      model: '',
      baseUrl: ' https://models.example.com ',
      verified: true,
    }))

    expect(llm.llmHeaders()['X-DeepSeek-Base-URL']).toBe('https://models.example.com')
    expect(llm.llmVerified.value).toBe(false)
  })

  it('仅保存密钥仍须验证，验证当前配置后才标记连接成功', async () => {
    const { llm, storage } = await loadLlm()
    llm.saveLlmSettings({ key: 'sk-saved', model: '' })

    expect(llm.llmVerified.value).toBe(false)
    llm.markLlmVerified({ key: ' sk-saved ', model: ' ' })

    expect(llm.llmVerified.value).toBe(true)
    expect(JSON.parse(storage.dump('pathpilot-llm')!)).toEqual({ key: 'sk-saved', model: '' })
  })

  it('验证草稿不覆盖已保存配置，保存相同草稿后应用验证结果', async () => {
    const { llm } = await loadLlm(JSON.stringify({ key: 'sk-saved', model: '' }))
    const draft = { key: 'sk-draft', model: 'custom-model', baseUrl: 'https://models.example.com' }

    llm.markLlmVerified(draft)

    expect(llm.llmSettings.value.key).toBe('sk-saved')
    expect(llm.llmVerified.value).toBe(false)
    llm.saveLlmSettings(draft)
    expect(llm.llmVerified.value).toBe(true)
  })

  it.each([
    { key: 'sk-other', model: '', baseUrl: 'https://models.example.com' },
    { key: 'sk-saved', model: 'other-model', baseUrl: 'https://models.example.com' },
    { key: 'sk-saved', model: '', baseUrl: 'https://other.example.com' },
  ])('修改任一连接字段后需重新验证：%j', async next => {
    const { llm } = await loadLlm()
    const saved = { key: 'sk-saved', model: '', baseUrl: 'https://models.example.com' }
    llm.saveLlmSettings(saved)
    llm.markLlmVerified(saved)
    expect(llm.llmVerified.value).toBe(true)

    llm.saveLlmSettings(next)

    expect(llm.llmVerified.value).toBe(false)
    llm.saveLlmSettings(saved)
    expect(llm.llmVerified.value).toBe(false)
  })

  it('允许验证空配置使用服务端密钥，清除后须重新验证', async () => {
    const { llm } = await loadLlm()

    llm.markLlmVerified({ key: '', model: '' })
    expect(llm.llmVerified.value).toBe(true)

    llm.clearLlmSettings()
    expect(llm.llmVerified.value).toBe(false)
    expect(llm.llmHeaders()).toEqual({})
  })
})
