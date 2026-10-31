import { describe, expect, it } from 'vitest'
import { buildWordCloud, CLOUD_VIEW } from './wordCloud'
import type { Evidence, SkillStat } from './types'

function stat(id: string, name: string, count: number, kind: Evidence['kind'] = '明确要求'): SkillStat {
  return { id, name, count, evidence: [{ jobId: 'job-1', sentence: name, kind }] }
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    a.y - a.height / 2 < b.y + b.height / 2 &&
    a.y + a.height / 2 > b.y - b.height / 2
  )
}

describe('buildWordCloud', () => {
  it('returns no words for empty input', () => {
    expect(buildWordCloud([])).toEqual([])
  })

  it('orders by count and scales size with frequency', () => {
    const words = buildWordCloud([
      stat('js', 'JavaScript', 5),
      stat('vue', 'Vue', 3),
      stat('git', 'Git', 1),
    ])

    expect(words.map(word => word.id)).toEqual(['js', 'vue', 'git'])
    expect(words[0].size).toBeGreaterThan(words[1].size)
    expect(words[1].size).toBeGreaterThan(words[2].size)
  })

  it('keeps every word inside the view box', () => {
    const words = buildWordCloud([
      stat('js', 'JavaScript', 5),
      stat('vue', 'Vue', 4),
      stat('git', 'Git', 3),
      stat('py', 'Python', 2),
      stat('sql', 'SQL', 1),
    ])

    for (const word of words) {
      expect(word.x - word.width / 2).toBeGreaterThanOrEqual(0)
      expect(word.x + word.width / 2).toBeLessThanOrEqual(CLOUD_VIEW.width)
      expect(word.y - word.height / 2).toBeGreaterThanOrEqual(0)
      expect(word.y + word.height / 2).toBeLessThanOrEqual(CLOUD_VIEW.height)
    }
  })

  it('never overlaps two words', () => {
    const words = buildWordCloud([
      stat('js', 'JavaScript', 5),
      stat('vue', 'Vue', 4),
      stat('git', 'Git', 3),
      stat('py', 'Python', 2),
      stat('sql', 'SQL', 1),
    ])

    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        expect(overlaps(words[i], words[j])).toBe(false)
      }
    }
  })

  it('maps requirement strength to colour families', () => {
    const words = buildWordCloud([
      stat('required', 'Vue', 3, '明确要求'),
      stat('bonus', 'Git', 2, '加分项'),
      stat('neutral', 'SQL', 1, '表述不明'),
    ])

    expect(words.find(word => word.id === 'required')?.kind).toBe('required')
    expect(words.find(word => word.id === 'bonus')?.kind).toBe('bonus')
    expect(words.find(word => word.id === 'neutral')?.kind).toBe('neutral')
  })
})
