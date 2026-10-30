import { computed, ref } from 'vue'

export interface LlmSettings {
  key: string
  model: string
}

export const KEY_HEADER = 'X-DeepSeek-Key'
export const MODEL_HEADER = 'X-DeepSeek-Model'

const STORAGE_KEY = 'pathpilot-llm'

const settings = ref<LlmSettings>(readSettings())

export const llmSettings = computed(() => settings.value)
export const hasLlmKey = computed(() => settings.value.key.length > 0)

function readSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { key: '', model: '' }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { key: '', model: '' }
    const record = parsed as Record<string, unknown>
    return {
      key: typeof record.key === 'string' ? record.key.trim() : '',
      model: typeof record.model === 'string' ? record.model.trim() : '',
    }
  } catch {
    return { key: '', model: '' }
  }
}

export function saveLlmSettings(next: LlmSettings): void {
  settings.value = { key: next.key.trim(), model: next.model.trim() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  } catch {}
}

export function clearLlmSettings(): void {
  settings.value = { key: '', model: '' }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function llmHeaders(using: LlmSettings = settings.value): Record<string, string> {
  const headers: Record<string, string> = {}
  const key = using.key.trim()
  const model = using.model.trim()
  if (key) headers[KEY_HEADER] = key
  if (model) headers[MODEL_HEADER] = model
  return headers
}
