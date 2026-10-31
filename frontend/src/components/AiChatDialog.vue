<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { X } from '@lucide/vue'
import ChatAssistant from './ChatAssistant.vue'
import { llmSettingsOpen } from '../llm'
import type { Plan } from '../types'

interface AiChatDialogProps {
  open: boolean
  plan: Plan
}

const PLAN_PROMPTS = [
  '这套路线哪里最吃力，能不能松一点',
  '想加一个竞赛或项目经历',
  '大二暑假该重点做什么',
  '每周只有 8 小时，怎么排更现实',
]

const props = defineProps<AiChatDialogProps>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'applied', plan: Plan): void
}>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (llmSettingsOpen.value) return
  emit('close')
}

watch(
  () => props.open,
  open => {
    if (typeof window === 'undefined') return
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ai-dialog-backdrop" @click.self="emit('close')">
      <div class="ai-dialog" role="dialog" aria-modal="true" aria-label="和 AI 规划助手交流">
        <button class="ai-dialog-close" type="button" aria-label="关闭对话框" @click="emit('close')">
          <X :size="18" />
        </button>
        <ChatAssistant
          :plan="plan"
          variant="dialog"
          :prompts="PLAN_PROMPTS"
          @applied="plan => emit('applied', plan)"
        />
      </div>
    </div>
  </Teleport>
</template>
