import { clone } from './clone'
import { llmHeaders, llmSettings, markLlmVerified, type LlmSettings } from './llm'
import type { Job, Plan, Profile } from './types'

const configuredBase = (import.meta.env.VITE_API_BASE ?? '/backend').trim()
const API_BASE = configuredBase.replace(/\/+$/, '')

export function remotePlanEnabled(): boolean {
  return configuredBase.length > 0
}

/** 只服务于现有三个接口，不自动重试可能产生新规划的POST请求。 */
async function requestJson(path: string, options: RequestInit, timeout: number): Promise<unknown> {
  if (!remotePlanEnabled()) throw new Error('当前为本地演示，未启用后端连接。')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    let response: Response
    try {
      response = await fetch(API_BASE + path, { ...options, signal: controller.signal })
    } catch {
      if (controller.signal.aborted) throw new Error('规划服务响应超时，请稍后重试。')
      throw new Error('无法连接规划服务，请确认后端已启动。')
    }
    const data: unknown = await response.json().catch(() => null)
    if (controller.signal.aborted) throw new Error('规划服务响应超时，请稍后重试。')
    if (!response.ok) {
      const message = isRecord(data) && typeof data.message === 'string' ? data.message : undefined
      throw new Error(message ?? (response.status === 404
        ? '规划服务未提供该接口，请检查后端启动入口。'
        : '规划服务暂时不可用，请稍后重试。'))
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

function jsonHeaders(using: LlmSettings): Record<string, string> {
  return { 'Content-Type': 'application/json', ...llmHeaders(using) }
}

export async function requestHealth(): Promise<void> {
  const data = await requestJson('/health', { method: 'GET' }, 8_000)
  if (!isRecord(data) || data.status !== 'ok') throw new Error('服务返回的健康状态不正确。')
}

export async function requestPlan(profile: Profile, jobs: Job[], version: number): Promise<Plan> {
  const snapshot = clone(profile)
  const selected = clone(jobs)
  const using = { ...llmSettings.value }
  // 后端默认最多三次、每次90秒；额外预留30秒传输与校验时间。
  const data = await requestJson('/api/plan', {
    method: 'POST', headers: jsonHeaders(using),
    body: JSON.stringify({ profile: snapshot, jobs: selected, version }),
  }, 300_000)
  if (!isRecord(data) || !isPlan(data.plan)) throw new Error('规划服务返回的数据格式不正确。')
  const plan = data.plan
  const sourceIds = new Set(selected.map(job => job.id))
  const sameProfile = (['major', 'semester', 'role', 'courses', 'hours', 'path'] as const)
    .every(key => plan.profile[key] === snapshot[key])
    && JSON.stringify(plan.profile.skills) === JSON.stringify(snapshot.skills)
    && JSON.stringify(plan.profile.interests) === JSON.stringify(snapshot.interests)
    && Object.entries(snapshot.scores).every(([key, value]) => plan.profile.scores[key as keyof Profile['scores']] === value)
  if (plan.version !== version || !sameProfile || plan.jobIds.some(id => !sourceIds.has(id))) {
    throw new Error('规划服务返回的方案与当前请求不一致，请重新生成。')
  }
  if (snapshot.hours > 0) markLlmVerified(using)
  return plan
}

export async function verifyLlmKey(using: LlmSettings): Promise<string> {
  const snapshot = { ...using }
  const data = await requestJson('/api/llm/verify', {
    method: 'POST', headers: jsonHeaders(snapshot),
  }, 100_000)
  if (!isRecord(data) || data.ok !== true || typeof data.model !== 'string' || !data.model.trim()) {
    throw new Error('校验服务返回的数据格式不正确。')
  }
  return data.model
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function textFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => typeof value[field] === 'string')
}

function semester(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8
}

function validProfile(value: unknown): boolean {
  if (!isRecord(value) || !textFields(value, ['major', 'courses'])) return false
  if (!semester(value.semester) || !['frontend', 'backend'].includes(String(value.role))) return false
  if (!['job', 'graduate', 'undecided'].includes(String(value.path))) return false
  if (typeof value.hours !== 'number' || !Number.isFinite(value.hours) || value.hours < 0 || value.hours > 30) return false
  if (!strings(value.skills) || !strings(value.interests) || !isRecord(value.scores)) return false
  const scores = value.scores
  return ['programming', 'project', 'analysis', 'communication'].every(key =>
    scores[key] === null || (typeof scores[key] === 'number' && Number.isFinite(scores[key])),
  )
}

function validTask(value: unknown): boolean {
  if (!isRecord(value) || !textFields(value, ['id', 'title', 'course', 'outcome', 'acceptance', 'reason'])) return false
  if (!value.id || !strings(value.skillIds) || !strings(value.prerequisites) || !strings(value.jobIds)) return false
  if (!['基础', '专项', '项目', '可选', '备考'].includes(String(value.kind))) return false
  if (value.semester !== null && !semester(value.semester)) return false
  if (value.startWeek !== null && !(typeof value.startWeek === 'number' && Number.isInteger(value.startWeek) && value.startWeek >= 1 && value.startWeek <= 16)) return false
  if (![value.hours, value.weeks].every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)) return false
  if (!['example', 'weekNote', 'periodLabel', 'module', 'moduleName'].every(key => value[key] === undefined || typeof value[key] === 'string')) return false
  if (value.periodKind !== undefined && !['semester', 'winter', 'summer'].includes(String(value.periodKind))) return false
  return value.periodIndex === undefined || (typeof value.periodIndex === 'number' && Number.isInteger(value.periodIndex))
}

/** 检查页面渲染的字段与引用；排期、预算等业务规则仍由后端校验。 */
function isPlan(value: unknown): value is Plan {
  if (!isRecord(value) || !textFields(value, ['id', 'createdAt']) || !value.id) return false
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return false
  if (!Number.isInteger(value.version) || !validProfile(value.profile) || !strings(value.jobIds)) return false
  if (!Array.isArray(value.tasks) || !value.tasks.every(validTask)) return false
  const tasks = value.tasks as Record<string, unknown>[]
  const taskIds = new Set(tasks.map(task => task.id))
  const jobIds = new Set(value.jobIds)
  if (taskIds.size !== tasks.length || tasks.some(task => (task.jobIds as string[]).some(id => !jobIds.has(id)))) return false
  if (value.overview !== undefined) {
    const overview = value.overview
    if (!isRecord(overview) || !textFields(overview, ['goal', 'strategy', 'decisionPoint']) || !strings(overview.principles) || !strings(overview.stack)) return false
    if (!Array.isArray(overview.milestones) || !overview.milestones.every(item => isRecord(item) && semester(item.semester) && textFields(item, ['title', 'evidence']) && (item.label === undefined || typeof item.label === 'string'))) return false
  }
  for (const key of ['semesters', 'vacations']) {
    const periods = value[key]
    if (periods === undefined) continue
    if (!Array.isArray(periods) || !periods.every(period => {
      if (!isRecord(period) || !textFields(period, ['title', 'goal', 'output', 'decision']) || !strings(period.itemIds)) return false
      if (period.itemIds.some(id => !taskIds.has(id))) return false
      return key === 'semesters' ? semester(period.semester)
        : textFields(period, ['id', 'label']) && ['summer', 'winter'].includes(String(period.kind)) && semester(period.afterSemester)
    })) return false
  }
  return true
}
