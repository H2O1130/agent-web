<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, Trash2, X } from '@lucide/vue'
import { remotePlanEnabled, requestHealth, verifyLlmKey } from '../api'
import { clearLlmSettings, llmSettings, markLlmVerified, saveLlmSettings, type LlmSettings } from '../llm'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const draftKey = ref('')
const draftModel = ref('')
const draftBaseUrl = ref('')
const reveal = ref(false)
const checking = ref(false)
const serviceStatus = ref<'checking' | 'ready' | 'unavailable' | 'local'>('local')
const serviceError = ref('')
const testedModel = ref('')
const verifiedDraft = ref<LlmSettings>()
const notice = ref<'saved' | 'verified' | ''>('')
const error = ref('')
const keyInput = ref<HTMLInputElement>()
let requestRevision = 0
let healthRevision = 0

const settingsChanged = computed(() =>
  draftKey.value.trim() !== llmSettings.value.key ||
  draftModel.value.trim() !== llmSettings.value.model ||
  draftBaseUrl.value.trim() !== (llmSettings.value.baseUrl ?? ''),
)

watch([draftKey, draftModel, draftBaseUrl], () => {
  requestRevision += 1
  checking.value = false
  notice.value = ''
  error.value = ''
  testedModel.value = ''
  verifiedDraft.value = undefined
}, { flush: 'sync' })

watch(
  () => props.open,
  async open => {
    requestRevision += 1
    healthRevision += 1
    checking.value = false
    if (!open) return
    draftKey.value = llmSettings.value.key
    draftModel.value = llmSettings.value.model
    draftBaseUrl.value = llmSettings.value.baseUrl ?? ''
    reveal.value = false
    notice.value = ''
    error.value = ''
    testedModel.value = ''
    verifiedDraft.value = undefined
    serviceError.value = ''
    serviceStatus.value = remotePlanEnabled() ? 'checking' : 'local'
    if (remotePlanEnabled()) void checkService(healthRevision)
    await nextTick()
    if (props.open) keyInput.value?.focus()
  },
  { immediate: true },
)

function close(): void {
  requestRevision += 1
  healthRevision += 1
  checking.value = false
  emit('close')
}

function currentDraft(): LlmSettings {
  const baseUrl = draftBaseUrl.value.trim()
  return {
    key: draftKey.value.trim(),
    model: draftModel.value.trim(),
    ...(baseUrl ? { baseUrl } : {}),
  }
}

async function checkService(revision: number): Promise<void> {
  try {
    await requestHealth()
    if (!props.open || revision !== healthRevision) return
    serviceStatus.value = 'ready'
  } catch (caught) {
    if (!props.open || revision !== healthRevision) return
    serviceStatus.value = 'unavailable'
    serviceError.value = caught instanceof Error ? caught.message : '无法连接规划服务，请确认后端已启动。'
  }
}

function persist(): void {
  if (checking.value) return
  const using = currentDraft()
  const tested = verifiedDraft.value
  saveLlmSettings(using)
  draftKey.value = llmSettings.value.key
  draftModel.value = llmSettings.value.model
  draftBaseUrl.value = llmSettings.value.baseUrl ?? ''
  if (tested && JSON.stringify(tested) === JSON.stringify(using)) markLlmVerified(using)
  notice.value = 'saved'
  error.value = ''
}

async function test(): Promise<void> {
  if (checking.value) return

  if (!remotePlanEnabled()) {
    error.value = '当前为本地演示，启用后端规划后可测试模型连接。'
    notice.value = ''
    return
  }

  checking.value = true
  const revision = ++requestRevision
  const using = currentDraft()
  error.value = ''
  notice.value = ''
  testedModel.value = ''
  verifiedDraft.value = undefined

  try {
    const model = await verifyLlmKey(using)
    if (!props.open || revision !== requestRevision) return
    testedModel.value = model
    verifiedDraft.value = using
    markLlmVerified(using)
    error.value = ''
    notice.value = 'verified'
  } catch (caught) {
    if (!props.open || revision !== requestRevision) return
    error.value = caught instanceof Error ? caught.message : '校验失败，请稍后重试。'
  } finally {
    if (revision === requestRevision) checking.value = false
  }
}

function forget(): void {
  if (checking.value) return
  clearLlmSettings()
  draftKey.value = ''
  draftModel.value = ''
  draftBaseUrl.value = ''
  reveal.value = false
  notice.value = ''
  error.value = ''
  testedModel.value = ''
  verifiedDraft.value = undefined
  keyInput.value?.focus()
}
</script>

<template>
  <div v-if="open" class="settings-backdrop" @click.self="close" @keydown.esc="close">
    <section
      class="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      aria-describedby="settings-hint"
    >
      <header class="settings-head">
        <div class="settings-icon"><KeyRound :size="20" /></div>
        <div>
          <h2 id="settings-title">模型设置</h2>
          <p id="settings-hint">填写自己的模型配置，留空则使用后端配置。</p>
        </div>
        <button class="icon-button settings-close" aria-label="关闭模型设置" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="settings-body">
        <p class="settings-note" :class="{ error: serviceStatus === 'unavailable' }" role="status">
          <LoaderCircle v-if="serviceStatus === 'checking'" :size="16" class="spin" />
          <CircleCheck v-else-if="serviceStatus === 'ready'" :size="16" />
          <CircleAlert v-else :size="16" />
          <span v-if="serviceStatus === 'checking'">正在检查规划服务…</span>
          <span v-else-if="serviceStatus === 'ready'">规划服务可达；服务运行正常不代表模型有效，请测试连接。</span>
          <span v-else-if="serviceStatus === 'unavailable'">{{ serviceError }}</span>
          <span v-else>当前为本地演示，生成路线使用本地规则。</span>
        </p>

        <label class="field">
          <span>密钥</span>
          <span class="settings-input">
            <input
              ref="keyInput"
              v-model="draftKey"
              :type="reveal ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="留空则使用后端配置的密钥"
              :disabled="checking"
              @keydown.enter.prevent="persist"
            />
            <button
              type="button"
              class="settings-eye"
              :aria-label="reveal ? '隐藏密钥' : '显示密钥'"
              :disabled="checking"
              @click="reveal = !reveal"
            >
              <EyeOff v-if="reveal" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
        </label>

        <label class="field">
          <span>模型 <span class="optional">可选</span></span>
          <input v-model="draftModel" :disabled="checking" placeholder="留空则使用服务端默认模型" spellcheck="false" />
        </label>

        <label class="field">
          <span>模型服务地址 <span class="optional">可选</span></span>
          <input
            v-model="draftBaseUrl"
            :disabled="checking"
            type="url"
            aria-label="模型服务地址"
            placeholder="留空则使用服务端默认地址"
            spellcheck="false"
          />
        </label>

        <p v-if="error" class="settings-note error" role="alert">
          <CircleAlert :size="16" />{{ error }}
        </p>
        <p v-else-if="notice === 'verified'" class="settings-note ok" role="status">
          <CircleCheck :size="16" /><span>连接成功，保存后应用<template v-if="testedModel">（{{ testedModel }}）</template>。</span>
        </p>
        <p v-else-if="notice === 'saved'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />配置已保存在本机浏览器，后续规划将使用此配置。
        </p>
        <p v-else class="settings-note">
          配置保存在本机浏览器，并随规划请求发给后端。空字段使用后端默认值。
        </p>
      </div>

      <footer class="settings-foot">
        <button type="button" class="text-button muted" :disabled="checking" @click="forget">
          <Trash2 :size="16" />清除
        </button>
        <div class="settings-foot-actions">
          <button type="button" class="button secondary small" :disabled="checking" @click="test">
            <LoaderCircle v-if="checking" :size="16" class="spin" />
            {{ checking ? '校验中' : '测试连接' }}
          </button>
          <button type="button" class="button primary small" :disabled="checking" @click="persist">
            {{ settingsChanged ? '保存' : '完成' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.settings-dialog {
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
}

.settings-note span {
  min-width: 0;
}
</style>
