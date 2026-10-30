<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, Trash2, X } from '@lucide/vue'
import { remotePlanEnabled, verifyLlmKey } from '../api'
import { clearLlmSettings, llmSettings, saveLlmSettings } from '../llm'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const draftKey = ref('')
const draftModel = ref('')
const reveal = ref(false)
const checking = ref(false)
const notice = ref<'saved' | 'verified' | ''>('')
const error = ref('')
const keyInput = ref<HTMLInputElement>()

const keyChanged = computed(() => draftKey.value.trim() !== llmSettings.value.key)

watch(
  () => props.open,
  async open => {
    if (!open) return
    draftKey.value = llmSettings.value.key
    draftModel.value = llmSettings.value.model
    reveal.value = false
    notice.value = ''
    error.value = ''
    await nextTick()
    keyInput.value?.focus()
  },
)

function close(): void {
  emit('close')
}

function persist(): void {
  saveLlmSettings({ key: draftKey.value, model: draftModel.value })
  draftKey.value = llmSettings.value.key
  draftModel.value = llmSettings.value.model
  notice.value = 'saved'
  error.value = ''
}

async function test(): Promise<void> {
  if (checking.value) return

  if (!draftKey.value.trim()) {
    error.value = '请先填写 DeepSeek 密钥。'
    notice.value = ''
    return
  }

  if (!remotePlanEnabled()) {
    error.value = '未配置后端地址，无法校验密钥。请先启动后端。'
    notice.value = ''
    return
  }

  checking.value = true
  error.value = ''
  notice.value = ''

  try {
    const model = await verifyLlmKey({ key: draftKey.value, model: draftModel.value })
    draftModel.value = model || draftModel.value
    error.value = ''
    notice.value = 'verified'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '校验失败，请稍后重试。'
  } finally {
    checking.value = false
  }
}

function forget(): void {
  clearLlmSettings()
  draftKey.value = ''
  draftModel.value = ''
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
          <h2 id="settings-title">模型设置</h2>
          <p id="settings-hint">填入自己的 DeepSeek 密钥，规划请求会统一用它调用模型。</p>
        </div>
        <button class="icon-button settings-close" aria-label="关闭模型设置" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="settings-body">
        <label class="field">
          <span>密钥</span>
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
        </label>

        <label class="field">
          <span>模型 <span class="optional">可选</span></span>
          <input v-model="draftModel" placeholder="留空则使用服务端默认模型" spellcheck="false" />
        </label>

        <p v-if="error" class="settings-note error" role="alert">
          <CircleAlert :size="16" />{{ error }}
        </p>
        <p v-else-if="notice === 'verified'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />密钥校验通过，已保存在本机浏览器。
        </p>
        <p v-else-if="notice === 'saved'" class="settings-note ok" role="status">
          <CircleCheck :size="16" />已保存在本机浏览器，之后的规划会用它调用模型。
        </p>
        <p v-else class="settings-note">
          密钥只保存在本机浏览器，并随请求头发给本地后端，不会写入仓库或日志。
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
            {{ keyChanged ? '保存' : '完成' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
