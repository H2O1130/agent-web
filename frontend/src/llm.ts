import { computed, ref } from 'vue'

export interface LlmSettings {
  key: string
  model: string
  baseUrl?: string
}

export const KEY_HEADER = 'X-DeepSeek-Key'
export const MODEL_HEADER = 'X-DeepSeek-Model'
export const BASE_URL_HEADER = 'X-DeepSeek-Base-URL'

const STORAGE_KEY = 'pathpilot-llm'

const settings = ref<LlmSettings>(readSettings())
const verifiedSettings = ref<LlmSettings>()

export const llmSettings = computed(() => settings.value)
export const hasLlmKey = computed(() => settings.value.key.length > 0)
export const llmVerified = computed(() =>
  verifiedSettings.value !== undefined && sameSettings(settings.value, verifiedSettings.value),
)

function normalizeSettings(value: LlmSettings): LlmSettings {
  const baseUrl = value.baseUrl?.trim()
  return {
    key: value.key.trim(),
    model: value.model.trim(),
    ...(baseUrl ? { baseUrl } : {}),
  }
}

function sameSettings(left: LlmSettings, right: LlmSettings): boolean {
  return left.key === right.key && left.model === right.model && left.baseUrl === right.baseUrl
}

function readSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { key: '', model: '' }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { key: '', model: '' }
    const record = parsed as Record<string, unknown>
    return normalizeSettings({
      key: typeof record.key === 'string' ? record.key.trim() : '',
      model: typeof record.model === 'string' ? record.model.trim() : '',
      baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : undefined,
    })
  } catch {
    return { key: '', model: '' }
  }
}

export function saveLlmSettings(next: LlmSettings): void {
  const normalized = normalizeSettings(next)
  if (verifiedSettings.value && !sameSettings(normalized, verifiedSettings.value)) {
    verifiedSettings.value = undefined
  }
  settings.value = normalized
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  } catch {}
}

export function clearLlmSettings(): void {
  verifiedSettings.value = undefined
  settings.value = { key: '', model: '' }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function markLlmVerified(using: LlmSettings): void {
  verifiedSettings.value = normalizeSettings(using)
}

export function llmHeaders(using: LlmSettings = settings.value): Record<string, string> {
  const headers: Record<string, string> = {}
  const key = using.key.trim()
  const model = using.model.trim()
  const baseUrl = using.baseUrl?.trim()
  if (key) headers[KEY_HEADER] = key
  if (model) headers[MODEL_HEADER] = model
  if (baseUrl) headers[BASE_URL_HEADER] = baseUrl
  return headers
}
