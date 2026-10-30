import { computed, ref } from 'vue'

const STORAGE_KEY = 'pathpilot-api'

export const DEFAULT_API_BASE = 'http://127.0.0.1:8000'

export function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function readStored(): string {
  try {
    return normalizeBase(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return ''
  }
}

const stored = ref(readStored())

/** 用户在「模型设置」里手填的后端地址 */
export const apiBaseOverride = computed(() => stored.value)
/** 实际生效的后端地址：手填优先，其次构建期 .env 的 VITE_API_BASE */
export const apiBase = computed(
  () => stored.value || normalizeBase(import.meta.env.VITE_API_BASE ?? ''),
)
export const hasApiBase = computed(() => apiBase.value.length > 0)
export const envApiBase = computed(() => normalizeBase(import.meta.env.VITE_API_BASE ?? ''))

export function saveApiBase(next: string): void {
  stored.value = normalizeBase(next)
  try {
    if (stored.value) localStorage.setItem(STORAGE_KEY, stored.value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function clearApiBase(): void {
  stored.value = ''
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
