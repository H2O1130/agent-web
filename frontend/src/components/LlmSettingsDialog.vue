<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Trash2,
  X,
} from '@lucide/vue'
import { probeBackend, requestLlmStatus, verifyLlmKey } from '../api'
import {
  DEFAULT_API_BASE,
  apiBaseOverride,
  envApiBase,
  saveApiBase,
} from '../apiConfig'
import { clearLlmSettings, llmSettings, saveLlmSettings, serverLlm, setServerLlm } from '../llm'

const KEY_URL = 'https://platform.deepseek.com/api_keys'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const draftKey = ref('')
const draftModel = ref('')
const draftBase = ref('')
const reveal = ref(false)
const checking = ref(false)
const showAdvanced = ref(false)
const notice = ref<'saved' | 'verified' | 'reachable' | 'server' | ''>('')
const error = ref('')
const keyInput = ref<HTMLInputElement>()

const keyChanged = computed(() => draftKey.value.trim() !== llmSettings.value.key)
const baseChanged = computed(() => draftBase.value.trim().replace(/\/+$/, '') !== apiBaseOverride.value)
const dirty = computed(() => keyChanged.value || baseChanged.value)

/** 当前会用到的后端地址，普通用户只看到这一行就够了 */
const currentBase = computed(() => draftBase.value.trim() || envApiBase.value)

const sourceText = computed(() => {
  if (draftKey.value.trim()) return '会用你自己填的密钥'
  if (serverLlm.value.configured) return '服务端已配好密钥，你可以留空'
  return '还没密钥，填一个就能对话'
})

watch(
  () => props.open,
  async open => {
    if (!open) return
    draftKey.value = llmSettings.value.key
    draftModel.value = llmSettings.value.model
    draftBase.value = apiBaseOverride.value
    reveal.value = false
    notice.value = ''
    error.value = ''
    // 没配过地址（也没有构建期地址）时，把后端地址摊开，避免用户找不到
    showAdvanced.value = !(apiBaseOverride.value || envApiBase.value)
    await refreshServerStatus()
    await nextTick()
    keyInput.value?.focus()
  },
)

async function refreshServerStatus(): Promise<void> {
  try {
    setServerLlm(await requestLlmStatus())
  } catch {
    setServerLlm({ configured: false, model: '' })
  }
}

function close(): void {
  emit('close')
}

function persist(): void {
  saveApiBase(draftBase.value)
  saveLlmSettings({ key: draftKey.value, model: draftModel.value })
  draftBase.value = apiBaseOverride.value
  draftKey.value = llmSettings.value.key
  draftModel.value = llmSettings.value.model
  notice.value = 'saved'
  error.value = ''
  void refreshServerStatus()
}

function targetBase(): string {
  return draftBase.value.trim() || envApiBase.value
}

async function test(): Promise<void> {
  if (checking.value) return

  const base = targetBase()
  if (!base) {
    error.value = `请先填写后端地址，例如 ${DEFAULT_API_BASE}。`
    notice.value = ''
    return
  }

  checking.value = true
  error.value = ''
  notice.value = ''

  try {
    await probeBackend(base)

    if (!draftKey.value.trim()) {
      await refreshServerStatus()
      notice.value = serverLlm.value.configured ? 'server' : 'reachable'
      return
    }

    const model = await verifyLlmKey({ key: draftKey.value, model: draftModel.value }, base)
    draftModel.value = model || draftModel.value
    notice.value = 'verified'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '校验失败，请稍后重试。'
  } finally {
    checking.value = false
  }
}

function forget(): void {
  clearLlmSettings()
  saveApiBase('')
  draftKey.value = ''
  draftModel.value = ''
  draftBase.value = ''
  reveal.value = false
  notice.value = ''
  error.value = ''
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
          <h2 id="settings-title">接入 AI</h2>
          <p id="settings-hint">填一个你自己的 DeepSeek 密钥，规划和对话就能用了。</p>
        </div>
        <button class="icon-button settings-close" aria-label="关闭模型设置" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="settings-body">
        <label class="field">
          <span>DeepSeek 密钥</span>
          <span class="settings-input">
            <input
              ref="keyInput"
              v-model="draftKey"
              :type="reveal ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="sk-..."
              @keydown.enter.prevent="persist"
            />
            <button
              type="button"
              class="settings-eye"
              :aria-label="reveal ? '隐藏密钥' : '显示密钥'"
              @click="reveal = !reveal"
            >
              <EyeOff v-if="reveal" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
          <small class="field-hint">
            还没有？去
            <a class="settings-link" :href="KEY_URL" target="_blank" rel="noreferrer noopener">
              platform.deepseek.com <ExternalLink :size="12" />
            </a>
            创建，复制 sk- 开头的那串。<br />
            密钥只存在这台浏览器里，每次对话随请求发给你连的后端，不会上传到别处。
          </small>
        </label>

        <p class="settings-source">
          <span class="settings-source-dot" :class="{ on: Boolean(draftKey.trim()) || serverLlm.configured }" />
          {{ sourceText }}
          <span class="settings-source-base">{{ currentBase || '未配置后端地址' }}</span>
        </p>

        <button
          type="button"
          class="settings-advanced"
          :aria-expanded="showAdvanced"
          @click="showAdvanced = !showAdvanced"
        >
          高级设置（后端地址、模型）
          <ChevronUp v-if="showAdvanced" :size="15" />
          <ChevronDown v-else :size="15" />
        </button>

        <div v-if="showAdvanced" class="settings-advanced-body">
          <label class="field">
            <span>后端地址 <span class="optional">一般不用改</span></span>
            <input
              v-model="draftBase"
              :placeholder="DEFAULT_API_BASE"
              spellcheck="false"
              autocomplete="off"
            />
            <small class="field-hint">
              本地开发填 {{ DEFAULT_API_BASE }}。留空则生成方案走本地规则，AI 对话不可用。
              <template v-if="envApiBase">
                <br />当前构建配置里的地址是 {{ envApiBase }}。
              </template>
            </small>
          </label>

          <label class="field">
            <span>模型 <span class="optional">可选</span></span>
            <input v-model="draftModel" placeholder="留空则使用服务端默认模型" spellcheck="false" />
          </label>
        </div>

        <p v-if="error" class="settings-note error" role="alert">
          <CircleAlert :size="16" />{{ error }}
        </p>
        <p v-else-if="notice === 'verified'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />后端可连接，密钥校验通过；记得点保存。
        </p>
        <p v-else-if="notice === 'server'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />后端已连接，服务端已配好密钥，直接对话即可。
        </p>
        <p v-else-if="notice === 'reachable'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />后端已连接。再填入 DeepSeek 密钥即可开始对话。
        </p>
        <p v-else-if="notice === 'saved'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />已保存在本机浏览器，规划和 AI 对话会立即使用新配置。
        </p>
        <p v-else class="settings-note">
          保存后浏览器会记住这个密钥，下次打开不用再填；换设备或清除浏览器数据后需要重新填。
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
          <button type="button" class="button primary small" @click="persist">
            {{ dirty ? '保存' : '完成' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
