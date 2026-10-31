import { describe, expect, it } from 'vitest'
import * as data from './data'

describe('真实岗位目录', () => {
  it('加载50条真实数据，覆盖九类并保留来源', () => {
    expect(data.realJobs).toHaveLength(50)
    expect(Object.keys(data.jobRoleNames)).toHaveLength(9)
    const counts: Record<string, number> = {}
    for (const job of data.realJobs) {
      counts[job.role] = (counts[job.role] ?? 0) + 1
      expect(job.source).toBe('collected')
      expect(job.url).toMatch(/^https:\/\/www\.nowcoder\.com\/jobs\/detail\/\d+$/)
      expect(job.text.length).toBeGreaterThan(80)
    }
    expect(new Set(data.realJobs.map(job => job.id)).size).toBe(50)
    expect(counts).toEqual({ frontend: 5, backend: 5, product: 6, agent: 6, llm: 5, devops: 5, embedded: 6, data: 6, testing: 6 })
  })

  it('前端默认使用5条真实岗位，Python后端仅使用3条明确接受Python的岗位', () => {
    expect(data.defaultJobIds('frontend')).toEqual(['nc-467328', 'nc-467408', 'nc-464866', 'nc-463664', 'nc-456510'])
    expect(data.defaultJobIds('backend')).toEqual(['nc-462212', 'nc-432841', 'nc-460588'])
    for (const id of ['nc-469522', 'nc-458051']) {
      expect(data.canPlanJob(data.realJobs.find(job => job.id === id)!, 'backend')).toBe(false)
    }
    expect(data.realJobs.filter(job => job.role === 'agent').every(job => !data.canPlanJob(job, 'frontend'))).toBe(true)
  })

  it('保留旧演示编号供历史查证，但不作为新规划默认选择', () => {
    expect(data.presetJobs).toHaveLength(62)
    expect(data.presetJobs.find(job => job.id === 'fe-01')?.source).toBe('demo')
    expect(data.presetJobs.find(job => job.id === 'be-01')?.source).toBe('demo')
    expect(data.defaultJobIds('frontend', data.presetJobs).every(id => id.startsWith('nc-'))).toBe(true)
  })
})
