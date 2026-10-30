<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { requestChat, remotePlanEnabled } from '../api'
import { hasLlmKey } from '../llm'
import { useWorkspace } from '../store'
import type { ChatMessage, ChatProposal, Plan } from '../types'

interface ChatAssistantProps {
  plan: Plan
}

const props = defineProps<ChatAssistantProps>()
const store = useWorkspace()

function greeting(plan: Plan): string {
  const periods = plan.semesters?.length ?? 0
  const tasks = plan.tasks.filter(task => task.semester !== null).length
  return `我是你的规划助手。当前是 V${plan.version}：每周 ${plan.profile.hours} 小时，约 ${periods || '若干'} 个学期、${tasks} 项行动。想调整时间、优先级或取舍，直接和我说。`
}

const messages = ref<ChatMessage[]>([{ role: 'assistant', content: greeting(props.plan) }])
const input = ref('')
const loading = ref(false)
const error = ref('')
const proposal = ref<ChatProposal | null>(null)
const applying = ref(false)
const listEl = ref<HTMLDivElement>()

const enabled = computed(() => remotePlanEnabled())
const ready = computed(() => enabled.value && hasLlmKey.value)

async function scrollToEnd(): Promise<void> {
  await nextTick()
  const element = listEl.value
  if (element) element.scrollTop = element.scrollHeight
}

async function send(): Promise<void> {
  const text = input.value.trim()
  if (!text || loading.value || !ready.value) return

  error.value = ''
  proposal.value = null
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  await scrollToEnd()

  try {
    const reply = await requestChat(messages.value.slice(-12), props.plan)
    messages.value.push({ role: 'assistant', content: reply.reply })
    if (reply.proposal) proposal.value = reply.proposal
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '对话失败，请稍后重试。'
  } finally {
    loading.value = false
    await scrollToEnd()
  }
}

async function applyProposal(): Promise<void> {
  const next = proposal.value
  if (!next || applying.value) return

  applying.value = true
  error.value = ''

  try {
    const plan = await store.generate(next.profile, props.plan.jobIds)
    messages.value.push({
      role: 'assistant',
      content: `已按你的确认生成 V${plan.version}：${next.summary}。页面已切到新版本，可对照查看变化。`,
    })
    proposal.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '生成新版本失败，请稍后重试。'
  } finally {
    applying.value = false
    await scrollToEnd()
  }
}

function dismissProposal(): void {
  proposal.value = null
  messages.value.push({ role: 'assistant', content: '好的，这次先不调整。你可以继续说想改的地方。' })
  scrollToEnd()
}
</script>

<template>
  <section class="panel chat-panel">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">在对话里，把方案调到更合适</span>
        <h2>和规划助手聊聊</h2>
      </div>
      <span class="tag">AI 讨论</span>
    </div>

    <p v-if="!enabled" class="chat-hint">
      对话需要连接后端模型：先在 <code>frontend/.env.local</code> 配置
      <code>VITE_API_BASE=http://127.0.0.1:8000</code> 并启动后端。
    </p>
    <p v-else-if="!hasLlmKey" class="chat-hint">
      还没有填写模型密钥，请点右上角「模型设置」填入 DeepSeek 密钥后再来。
    </p>

    <div ref="listEl" class="chat-log" role="log" aria-live="polite" aria-label="规划助手对话记录">
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="chat-bubble"
        :class="message.role"
      >
        <span class="chat-role">{{ message.role === 'user' ? '我' : '助手' }}</span>
        <p>{{ message.content }}</p>
      </div>
      <div v-if="loading" class="chat-bubble assistant typing">
        <span class="chat-role">助手</span>
        <p>正在思考…</p>
      </div>
    </div>

    <div v-if="proposal" class="chat-proposal">
      <div>
        <span class="small-label">AI 建议调整</span>
        <p>{{ proposal.summary }}</p>
        <p class="muted">确认后会按新条件重新生成一版方案（版本 +1）。</p>
      </div>
      <div class="chat-proposal-actions">
        <button class="button primary small" :disabled="applying" @click="applyProposal">
          {{ applying ? '生成中…' : '确认生成新版本' }}
        </button>
        <button class="button secondary small" :disabled="applying" @click="dismissProposal">不采用</button>
      </div>
    </div>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <form class="chat-input" @submit.prevent="send">
      <input
        v-model="input"
        type="text"
        :disabled="!ready || loading"
        placeholder="例如：我下学期课多，每周只能 8 小时"
        aria-label="输入你想和规划助手讨论的内容"
      />
      <button class="button primary" type="submit" :disabled="!ready || loading || !input.trim()">
        发送
      </button>
    </form>
  </section>
</template>
