<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ChatAssistant from './ChatAssistant.vue'
import { llmSettingsOpen } from '../llm'
import type { Plan } from '../types'

interface AiChatDialogProps {
  open: boolean
  plan: Plan
}

interface Position {
  x: number
  y: number
}

const props = defineProps<AiChatDialogProps>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'applied', plan: Plan): void
}>()

const dialogEl = ref<HTMLElement>()
const position = ref<Position | null>(null)
const dragging = ref(false)
const MARGIN = 16

interface DragState {
  offsetX: number
  offsetY: number
  width: number
  height: number
}

let drag: DragState | null = null

function clampPosition(x: number, y: number, width: number, height: number): Position {
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - Math.min(height, window.innerHeight - MARGIN * 2) - MARGIN)
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  }
}

function startDrag(event: PointerEvent): void {
  if (window.innerWidth < 640) return
  if ((event.target as HTMLElement).closest('button')) return
  const element = dialogEl.value
  if (!element) return

  const rect = element.getBoundingClientRect()
  drag = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  }
  position.value = { x: rect.left, y: rect.top }
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function moveDrag(event: PointerEvent): void {
  if (!drag) return
  position.value = clampPosition(
    event.clientX - drag.offsetX,
    event.clientY - drag.offsetY,
    drag.width,
    drag.height,
  )
}

function endDrag(event: PointerEvent): void {
  if (!drag) return
  drag = null
  dragging.value = false
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
}

function keepInViewport(): void {
  if (!position.value) return
  const rect = dialogEl.value?.getBoundingClientRect()
  if (!rect) return
  position.value = clampPosition(position.value.x, position.value.y, rect.width, rect.height)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (llmSettingsOpen.value) return
  emit('close')
}

watch(
  () => props.open,
  async open => {
    if (typeof window === 'undefined') return
    if (open) {
      position.value = null
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('resize', keepInViewport)
    } else {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', keepInViewport)
    }
    await nextTick()
    if (open) dialogEl.value?.focus()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', keepInViewport)
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ai-dialog-backdrop">
      <div
        ref="dialogEl"
        class="ai-dialog"
        :class="{ 'is-dragging': dragging, 'is-moved': position }"
        :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined"
        role="dialog"
        aria-modal="false"
        aria-label="和 AI 规划助手交流"
        tabindex="-1"
      >
        <header
          class="ai-dialog-head"
          @pointerdown="startDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <div>
            <span class="eyebrow">基于当前规划</span>
            <h2>和 AI 规划助手聊聊</h2>
          </div>
          <div class="ai-dialog-head-actions">
            <span class="ai-dialog-drag-hint">拖动标题可移动</span>
            <button class="ai-dialog-close" type="button" aria-label="关闭对话框" @click="emit('close')">
              ×
            </button>
          </div>
        </header>

        <ChatAssistant :plan="plan" variant="dialog" @applied="plan => emit('applied', plan)" />
      </div>
    </div>
  </Teleport>
</template>
