import { llmHeaders, type LlmSettings } from './llm'
import type { Job, Plan, Profile } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/$/, '')

export function remotePlanEnabled(): boolean {
  return API_BASE.length > 0
}

function jsonHeaders(using?: LlmSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(using ? llmHeaders(using) : llmHeaders()),
  }
}

export async function requestPlan(profile: Profile, jobs: Job[], version: number): Promise<Plan> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}/api/plan`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ profile, jobs, version }),
    })
  } catch {
    throw new Error('无法连接规划服务，请确认后端已启动。')
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(messageOf(data) ?? '规划服务暂时不可用，请稍后重试。')
  }

  if (!isRecord(data) || !isRecord(data.plan) || !Array.isArray(data.plan.tasks)) {
    throw new Error('规划服务返回的数据格式不正确。')
  }

  return data.plan as unknown as Plan
}

export async function verifyLlmKey(using: LlmSettings): Promise<string> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}/api/llm/verify`, {
      method: 'POST',
      headers: jsonHeaders(using),
    })
  } catch {
    throw new Error('无法连接规划服务，请确认后端已启动。')
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(messageOf(data) ?? '密钥校验失败，请稍后重试。')
  }

  if (!isRecord(data) || data.ok !== true) {
    throw new Error('校验服务返回的数据格式不正确。')
  }

  return typeof data.model === 'string' ? data.model : ''
}

function messageOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.message === 'string' ? value.message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
