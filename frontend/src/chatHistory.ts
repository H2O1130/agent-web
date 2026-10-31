import type { ChatMessage } from './types'

const STORAGE_KEY = 'pathpilot-chat'
const LIMIT = 80

export interface ChatHistory {
  planId: string
  messages: ChatMessage[]
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record.role === 'user' || record.role === 'assistant') &&
    typeof record.content === 'string'
  )
}

/** 读取上次的对话，浏览器里没有或格式不对就当作没有。 */
export function loadChat(): ChatHistory | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.messages)) return null
    const messages = record.messages.filter(isMessage)
    if (!messages.length) return null
    return {
      planId: typeof record.planId === 'string' ? record.planId : '',
      messages: messages.slice(-LIMIT),
    }
  } catch {
    return null
  }
}

export function saveChat(planId: string, messages: ChatMessage[]): void {
  if (!messages.length) return
  try {
    const payload: ChatHistory = { planId, messages: messages.slice(-LIMIT) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {}
}

export function clearChat(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
