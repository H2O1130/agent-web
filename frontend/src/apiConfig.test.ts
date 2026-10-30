import { afterEach, describe, expect, it, vi } from 'vitest'

function memoryStorage(seed?: string) {
  const data = new Map<string, string>()
  if (seed !== undefined) data.set('pathpilot-api', seed)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    dump: (key: string) => data.get(key) ?? null,
  }
}

async function loadConfig(seed?: string, env = '') {
  const storage = memoryStorage(seed)
  vi.stubGlobal('localStorage', storage)
  vi.stubEnv('VITE_API_BASE', env)
  vi.resetModules()
  const config = await import('./apiConfig')
  return { config, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('运行时后端地址', () => {
  it('默认没有可用地址', async () => {
    const { config } = await loadConfig()

    expect(config.hasApiBase.value).toBe(false)
    expect(config.apiBase.value).toBe('')
  })

  it('读取浏览器保存的地址并去掉结尾斜杠', async () => {
    const { config } = await loadConfig('http://127.0.0.1:9000/')

    expect(config.apiBase.value).toBe('http://127.0.0.1:9000')
    expect(config.hasApiBase.value).toBe(true)
  })

  it('没有保存过时回退到构建配置里的地址', async () => {
    const { config } = await loadConfig('', 'http://127.0.0.1:8000/')

    expect(config.apiBase.value).toBe('http://127.0.0.1:8000')
    expect(config.envApiBase.value).toBe('http://127.0.0.1:8000')
  })

  it('浏览器保存的地址优先于构建配置', async () => {
    const { config } = await loadConfig(undefined, 'http://127.0.0.1:8000')

    config.saveApiBase('http://localhost:9000/')

    expect(config.apiBase.value).toBe('http://localhost:9000')
    expect(config.apiBaseOverride.value).toBe('http://localhost:9000')
  })

  it('清除地址后回退到构建配置', async () => {
    const { config, storage } = await loadConfig('http://localhost:9000', 'http://127.0.0.1:8000')

    config.clearApiBase()

    expect(config.apiBase.value).toBe('http://127.0.0.1:8000')
    expect(storage.dump('pathpilot-api')).toBe(null)
  })
})
