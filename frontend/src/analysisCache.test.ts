import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisCacheKey, clearAnalysisCache, readAnalysisCache, writeAnalysisCache } from './analysisCache'
import { defaultProfile } from './data'
import type { Job } from './types'

const job: Job = {
  id: 'one', role: 'frontend', title: '前端', company: '示例', education: '本科',
  text: '掌握 JavaScript', source: 'collected', url: '', collectedAt: '',
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    keys: () => [...data.keys()],
  }
}

beforeEach(() => {
  const storage = memoryStorage()
  vi.stubGlobal('sessionStorage', storage)
  Object.defineProperty(sessionStorage, '_dump', { value: storage, enumerable: false })
  clearAnalysisCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const result = { skills: [], mappings: [] }

describe('岗位分析缓存', () => {
  it('同一组岗位、方向和画像命中缓存', () => {
    const key = analysisCacheKey([job], defaultProfile, 'frontend')
    expect(readAnalysisCache(key)).toBeNull()
    writeAnalysisCache(key, result)
    expect(readAnalysisCache(key)).toEqual(result)
  })

  it('方向或原文变化后不再命中', () => {
    const key = analysisCacheKey([job], defaultProfile, 'frontend')
    writeAnalysisCache(key, result)

    expect(readAnalysisCache(analysisCacheKey([job], defaultProfile, 'product'))).toBeNull()
    expect(readAnalysisCache(analysisCacheKey([{ ...job, text: '换了一段原文' }], defaultProfile, 'frontend'))).toBeNull()
  })

  it('超过 10 分钟后失效', () => {
    const key = analysisCacheKey([job], defaultProfile, 'frontend')
    writeAnalysisCache(key, result, 1_000)
    expect(readAnalysisCache(key, 1_000 + 10 * 60 * 1000 + 1)).toBeNull()
  })

  it('清空缓存后不再命中', () => {
    const key = analysisCacheKey([job], defaultProfile, 'frontend')
    writeAnalysisCache(key, result)
    clearAnalysisCache()
    expect(readAnalysisCache(key)).toBeNull()
  })
})
