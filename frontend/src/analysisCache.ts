import type { Job, MappingRow, Profile, SkillStat } from './types'

export interface AnalyzeResult {
  skills: SkillStat[]
  mappings: MappingRow[]
}

interface CachedAnalysis extends AnalyzeResult {
  savedAt: number
}

const PREFIX = 'pathpilot-analysis:'
const TTL = 10 * 60 * 1000
const memory = new Map<string, CachedAnalysis>()
const written = new Set<string>()

function hash(text: string): string {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0
  }
  return `${text.length}-${value >>> 0}`
}

export function analysisCacheKey(jobs: Job[], profile: Profile, direction: string): string {
  const jobPart = jobs
    .map(job => `${job.id}:${hash(job.text)}`)
    .sort()
    .join(',')
  const profilePart = [
    profile.major,
    profile.semester,
    profile.role,
    profile.hours,
    profile.path,
    profile.courses,
    [...profile.skills].sort().join(','),
  ].join('|')
  return `${PREFIX}${direction}|${profilePart}|${jobPart}`
}

export function readAnalysisCache(key: string, now = Date.now()): AnalyzeResult | null {
  const hit = memory.get(key) ?? readStorage(key)
  if (!hit) return null
  if (now - hit.savedAt > TTL) {
    memory.delete(key)
    removeStorage(key)
    return null
  }
  memory.set(key, hit)
  return { skills: hit.skills, mappings: hit.mappings }
}

export function writeAnalysisCache(key: string, result: AnalyzeResult, now = Date.now()): void {
  const cached: CachedAnalysis = { ...result, savedAt: now }
  memory.set(key, cached)
  written.add(key)
  try {
    sessionStorage.setItem(key, JSON.stringify(cached))
  } catch {}
}

export function clearAnalysisCache(): void {
  memory.clear()
  for (const key of written) removeStorage(key)
  written.clear()
}

function readStorage(key: string): CachedAnalysis | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedAnalysis
    if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.mappings)) return null
    return parsed
  } catch {
    return null
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {}
}
