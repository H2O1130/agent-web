// 大模型接口客户端（M3 · 前端侧）
// 对应《方向A·需求与分工》8.4 接口草案 + 马凯确认：调用失败直接报错，不做本地降级。
// 仅前端 HTTP 封装；密钥与服务端逻辑在 agent/backend（8.5），前端不接触密钥。
// 现阶段未接线（本地规划逻辑仍在），待后端就绪后由 B.3 替换点接入。

import type { Job, Profile, Plan, TaskChange, SkillStat, Role } from '../types'

// 后端基址。同域部署留空即可；跨域时在 vite.config.ts 配代理或改为环境变量。
export const API_BASE = ''

export class ModelApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ModelApiError'
    this.code = code
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ModelApiError('network', '网络异常，无法连接服务')
  }
  if (!res.ok) {
    let message = '服务异常，请稍后重试'
    let code = String(res.status)
    try {
      const data = (await res.json()) as { code?: string; message?: string }
      if (typeof data.message === 'string') message = data.message
      if (typeof data.code === 'string') code = data.code
    } catch {
      // 非 JSON 错误体，沿用默认文案
    }
    throw new ModelApiError(code, message)
  }
  return (await res.json()) as T
}

// 8.4：POST /api/analyze → { skills: SkillStat[] }
export function analyzeJobsApi(jobs: Job[]): Promise<{ skills: SkillStat[] }> {
  return post('/api/analyze', { jobs })
}

// 8.4：POST /api/plan → { plan: Plan }
export function createPlanApi(
  profile: Profile,
  jobs: Job[],
  version: number,
): Promise<{ plan: Plan }> {
  return post('/api/plan', { profile, jobs, version })
}

// 8.4：POST /api/plan/replan → { plan: Plan, changes: TaskChange[] }
export function replanApi(
  before: Plan,
  profile: Profile,
  jobs: Job[],
): Promise<{ plan: Plan; changes: TaskChange[] }> {
  return post('/api/plan/replan', { before, profile, jobs })
}

// 8.4：POST /api/jobs/import → { job: Job }
export function importJobApi(
  url: string,
  text: string,
  role: Role,
): Promise<{ job: Job }> {
  return post('/api/jobs/import', { url, text, role })
}
