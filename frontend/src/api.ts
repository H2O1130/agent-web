import { apiBase, normalizeBase } from './apiConfig'
import { llmHeaders, type LlmSettings } from './llm'
import type { ChatMessage, ChatReply, CustomTask, Job, Plan, Profile } from './types'

export function remotePlanEnabled(): boolean {
  return apiBase.value.length > 0
}

function jsonHeaders(using?: LlmSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(using ? llmHeaders(using) : llmHeaders()),
  }
}

export interface PlanExtras {
  /** AI 在对话里补充的任务 */
  customTasks?: CustomTask[]
  /** 要替换掉的模块，例如把 python 换成 java */
  dropModules?: string[]
}

export async function requestPlan(
  profile: Profile,
  jobs: Job[],
  version: number,
  extras: PlanExtras = {},
): Promise<Plan> {
  if (!remotePlanEnabled()) throw new Error('当前为本地演示，未启用后端连接。')

  let response: Response

  try {
    response = await fetch(`${apiBase.value}/api/plan`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        profile,
        jobs,
        version,
        customTasks: extras.customTasks ?? [],
        dropModules: extras.dropModules ?? [],
      }),
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

interface ChatItemDigest {
  id: string
  title: string
  semester: number | null
  kind: string
  hours: number
}

interface ChatPeriodDigest {
  label: string
  title: string
  goal: string
  items: ChatItemDigest[]
}

function buildPlanDigest(plan: Plan): { version: number; profile: Profile; periods: ChatPeriodDigest[] } {
  const taskMap = new Map(plan.tasks.map(task => [task.id, task]))

  const itemOf = (id: string): ChatItemDigest | null => {
    const task = taskMap.get(id)
    if (!task) return null
    return { id: task.id, title: task.title, semester: task.semester, kind: task.kind, hours: task.hours }
  }
  const itemsOf = (ids: string[]): ChatItemDigest[] =>
    ids.map(itemOf).filter((item): item is ChatItemDigest => item !== null)

  const periods: ChatPeriodDigest[] = []

  for (const semester of plan.semesters ?? []) {
    periods.push({
      label: `第 ${semester.semester} 学期`,
      title: semester.title,
      goal: semester.goal,
      items: itemsOf(semester.itemIds),
    })
  }
  for (const vacation of plan.vacations ?? []) {
    periods.push({
      label: vacation.label,
      title: vacation.title,
      goal: vacation.goal,
      items: itemsOf(vacation.itemIds),
    })
  }

  if (!periods.length) {
    const groups = new Map<number, ChatPeriodDigest>()
    for (const task of plan.tasks) {
      if (task.semester === null) continue
      const group = groups.get(task.semester) ?? {
        label: `第 ${task.semester} 学期`,
        title: '',
        goal: '',
        items: [],
      }
      group.items.push({
        id: task.id,
        title: task.title,
        semester: task.semester,
        kind: task.kind,
        hours: task.hours,
      })
      groups.set(task.semester, group)
    }
    periods.push(...[...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group))
  }

  return { version: plan.version, profile: plan.profile, periods }
}

export async function requestChat(messages: ChatMessage[], plan: Plan): Promise<ChatReply> {
  let response: Response

  try {
    response = await fetch(`${apiBase.value}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ messages, profile: plan.profile, plan: buildPlanDigest(plan) }),
    })
  } catch {
    throw new Error('无法连接规划服务，请确认后端已启动。')
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(messageOf(data) ?? '对话服务暂时不可用，请稍后重试。')
  }

  if (!isRecord(data) || typeof data.reply !== 'string') {
    throw new Error('对话服务返回的数据格式不正确。')
  }

  return data as unknown as ChatReply
}

export interface LlmStatus {
  configured: boolean
  model: string
}

/** 只读：服务端有没有配好密钥。普通用户因此不需要自己填 key。 */
export async function requestLlmStatus(): Promise<LlmStatus> {
  if (!remotePlanEnabled()) return { configured: false, model: '' }

  let response: Response

  try {
    response = await fetch(`${apiBase.value}/api/llm/status`)
  } catch {
    throw new Error('无法连接规划服务，请确认后端已启动。')
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(messageOf(data) ?? '读取模型状态失败，请稍后重试。')
  }

  if (!isRecord(data) || typeof data.configured !== 'boolean') {
    throw new Error('模型状态返回的数据格式不正确。')
  }

  return {
    configured: data.configured,
    model: typeof data.model === 'string' ? data.model : '',
  }
}

export async function verifyLlmKey(using: LlmSettings, base = apiBase.value): Promise<string> {
  const target = normalizeBase(base)
  if (!target) throw new Error('还没有填写后端地址。')

  let response: Response

  try {
    response = await fetch(`${target}/api/llm/verify`, {
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

/** 用 /health 确认这个地址后面确实是本项目的后端（不校验密钥）。 */
export async function probeBackend(base: string): Promise<void> {
  const target = normalizeBase(base)
  if (!target) throw new Error('请先填写后端地址。')

  let response: Response

  try {
    response = await fetch(`${target}/health`, { method: 'GET' })
  } catch {
    throw new Error('连不上这个地址，请确认后端已启动、端口填写正确。')
  }

  if (!response.ok) {
    throw new Error('这个地址有响应，但不是本项目的后端（/health 不可用）。')
  }

  const data: unknown = await response.json().catch(() => null)

  if (!isRecord(data) || data.status !== 'ok') {
    throw new Error('这个地址有响应，但不是本项目的后端（/health 返回异常）。')
  }
}

function messageOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.message === 'string' ? value.message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
