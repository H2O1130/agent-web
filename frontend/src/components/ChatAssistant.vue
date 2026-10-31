<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { CalendarDays, CircleCheck, Clock, Eraser, KeyRound, Send, Sparkles, Target } from '@lucide/vue'
import { requestChat, remotePlanEnabled } from '../api'
import { clearChat, loadChat, saveChat } from '../chatHistory'
import { llmReady, openLlmSettings } from '../llm'
import { mergeEdits, moduleLabel } from '../planEdits'
import { useWorkspace } from '../store'
import type { ChatMessage, ChatProposal, Plan } from '../types'

type ChatVariant = 'panel' | 'dialog' | 'hero'

interface ChatAssistantProps {
  plan: Plan
  variant?: ChatVariant
  prompts?: string[]
}

const props = withDefaults(defineProps<ChatAssistantProps>(), {
  variant: 'panel',
  prompts: () => [],
})
const emit = defineEmits<{ (event: 'applied', plan: Plan): void }>()
const store = useWorkspace()

function countPeriods(plan: Plan): number {
  if (plan.semesters?.length) return plan.semesters.length
  const semesters = new Set<number>()
  for (const task of plan.tasks) {
    if (task.semester !== null) semesters.add(task.semester)
  }
  return semesters.size
}

function greeting(plan: Plan): string {
  const periods = countPeriods(plan)
  const tasks = plan.tasks.filter(task => task.semester !== null).length
  return `我是你的规划助手。当前是 V${plan.version}：每周 ${plan.profile.hours} 小时，约 ${periods || '若干'} 个学期、${tasks} 项行动。想调整时间、优先级或取舍，直接和我说。`
}

const savedChat = loadChat()
const messages = ref<ChatMessage[]>(
  savedChat?.messages.length
    ? savedChat.messages
    : [{ role: 'assistant', content: greeting(props.plan) }],
)
let savedPlanId = savedChat?.planId ?? ''
// 由这里点「确认生成」触发的版本变化，正文里已经说明过，不再额外补一条提示
let appliedBySelf = false
const input = ref('')
const loading = ref(false)
const error = ref('')
const proposal = ref<ChatProposal | null>(null)
const applying = ref(false)
const listEl = ref<HTMLDivElement>()
const inputEl = ref<HTMLInputElement>()

const enabled = computed(() => remotePlanEnabled())
const ready = computed(() => enabled.value && llmReady.value)
const periodCount = computed(() => countPeriods(props.plan))
const taskCount = computed(() => props.plan.tasks.filter(task => task.semester !== null).length)
const showHeading = computed(() => props.variant !== 'dialog')

// 方案换版本时：没开口就换开场白；聊过就补一句，说明接下来基于新版本
watch(
  () => props.plan.id,
  id => {
    const started = messages.value.some(message => message.role === 'user')
    if (started && savedPlanId && savedPlanId !== id && !appliedBySelf) {
      messages.value.push({
        role: 'assistant',
        content: `方案已经更新到 V${props.plan.version}，接下来的建议会基于新版本。`,
      })
    } else if (!started) {
      messages.value = [{ role: 'assistant', content: greeting(props.plan) }]
    }
    savedPlanId = id
  },
)

watch(
  messages,
  value => saveChat(props.plan.id, value),
  { deep: true },
)

onMounted(() => {
  if (!savedPlanId) savedPlanId = props.plan.id
  saveChat(props.plan.id, messages.value)
  scrollToEnd()
})

const hasUserMessage = computed(() => messages.value.some(message => message.role === 'user'))

// 这次建议会新增哪些任务、替换掉哪些模块，直接摆出来，避免「说了但没改」的错觉
const proposalAdds = computed(() => proposal.value?.customTasks ?? [])
const proposalDrops = computed(() =>
  (proposal.value?.dropModules ?? []).map(module => ({
    id: module,
    label: moduleLabel(props.plan, module),
  })),
)
const proposalChanges = computed(() => proposalAdds.value.length > 0 || proposalDrops.value.length > 0)

const showPrompts = computed(
  () =>
    props.variant !== 'panel' &&
    props.prompts.length > 0 &&
    proposal.value === null &&
    !messages.value.some(message => message.role === 'user'),
)

async function scrollToEnd(): Promise<void> {
  await nextTick()
  const element = listEl.value
  if (element) element.scrollTop = element.scrollHeight
}

function focusInput(): void {
  inputEl.value?.focus()
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

async function sendText(text: string): Promise<void> {
  if (!ready.value || loading.value) return
  input.value = text
  await send()
}

async function applyProposal(): Promise<void> {
  const next = proposal.value
  if (!next || applying.value) return

  applying.value = true
  appliedBySelf = true
  error.value = ''

  try {
    // 之前确认过的补充任务/替换模块一并带上，否则新版本会把它们弄丢
    const edits = mergeEdits(props.plan, next)
    const plan = await store.generate(next.profile, props.plan.jobIds, edits)
    messages.value.push({
      role: 'assistant',
      content: `已按你的确认生成 V${plan.version}：${next.summary}。页面已切到新版本，可对照查看变化。`,
    })
    proposal.value = null
    emit('applied', plan)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '生成新版本失败，请稍后重试。'
  } finally {
    appliedBySelf = false
    applying.value = false
    await scrollToEnd()
  }
}

function dismissProposal(): void {
  proposal.value = null
  messages.value.push({ role: 'assistant', content: '好的，这次先不调整。你可以继续说想改的地方。' })
  scrollToEnd()
}

function resetChat(): void {
  clearChat()
  proposal.value = null
  error.value = ''
  messages.value = [{ role: 'assistant', content: greeting(props.plan) }]
  savedPlanId = props.plan.id
  scrollToEnd()
}

defineExpose({ focusInput })
</script>

<template>
  <section class="chat-panel" :class="`chat-panel--${variant}`">
    <header v-if="variant !== 'panel'" class="chat-hero-head">
      <span class="chat-avatar" aria-hidden="true"><Sparkles :size="19" /></span>
      <div class="chat-hero-text">
        <div class="chat-hero-title">
          <h2>AI 规划顾问</h2>
          <span class="chat-status" :class="{ off: !ready }"><i />{{ ready ? '可以对话' : '待配置' }}</span>
        </div>
        <p>它已经读过你这份 V{{ plan.version }} 方案，会结合规则给出可确认的调整建议。</p>
      </div>
    </header>

    <div v-else-if="showHeading" class="panel-heading">
      <div>
        <span class="eyebrow">在对话里，把方案调到更合适</span>
        <h2>和规划助手聊聊</h2>
      </div>
      <span class="tag">AI 讨论</span>
    </div>

    <div v-if="variant !== 'panel'" class="chat-facts">
      <span><Clock :size="14" />每周 {{ plan.profile.hours }} 小时</span>
      <span><CalendarDays :size="14" />{{ periodCount }} 个学期</span>
      <span><Target :size="14" />{{ taskCount }} 项行动</span>
    </div>

    <div v-if="!ready" class="chat-setup">
      <span class="chat-setup-icon" aria-hidden="true"><KeyRound :size="18" /></span>
      <div class="chat-setup-text">
        <strong>{{ enabled ? '还差一把密钥' : '还没有连接模型' }}</strong>
        <p v-if="enabled">后端已经就绪，填入你自己的 DeepSeek 密钥就能开始对话，密钥只存在这台浏览器。</p>
        <p v-else>填上后端地址和一把 DeepSeek 密钥，保存后就能在这里直接对话，不用改代码。</p>
      </div>
      <button class="button secondary small" type="button" @click="openLlmSettings">
        <KeyRound :size="15" />{{ enabled ? '填入密钥' : '设置 API' }}
      </button>
    </div>

    <div class="chat-stage">
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

      <div v-if="showPrompts" class="chat-prompts">
        <span class="small-label">不知道怎么开口？试试这些</span>
        <div class="chat-prompt-row">
          <button
            v-for="prompt in prompts"
            :key="prompt"
            type="button"
            class="chat-prompt"
            :disabled="!ready || loading"
            @click="sendText(prompt)"
          >{{ prompt }}</button>
        </div>
      </div>
    </div>

    <div v-if="proposal" class="chat-proposal">
      <div>
        <span class="small-label">AI 建议调整</span>
        <p>{{ proposal.summary }}</p>
        <ul v-if="proposalChanges" class="chat-proposal-changes">
          <li v-for="task in proposalAdds" :key="`add-${task.id}`" class="add">
            <span>新增</span>{{ task.title }}
            <small>{{ task.action }}</small>
          </li>
          <li v-for="module in proposalDrops" :key="`drop-${module.id}`" class="drop">
            <span>替换</span>{{ module.label }} 模块不再安排
          </li>
        </ul>
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
        ref="inputEl"
        v-model="input"
        type="text"
        :disabled="!ready || loading"
        placeholder="例如：我下学期课多，每周只能 8 小时"
        aria-label="输入你想和规划助手讨论的内容"
      />
      <button class="button primary" type="submit" :disabled="!ready || loading || !input.trim()">
        <Send :size="15" />发送
      </button>
    </form>

    <div v-if="hasUserMessage" class="chat-foot">
      <span><CircleCheck :size="13" />对话保存在本机，下次进来接着聊</span>
      <button type="button" class="chat-clear" @click="resetChat">
        <Eraser :size="13" />清空对话
      </button>
    </div>
  </section>
</template>
