<script setup lang="ts">
import { computed } from 'vue'
import { buildWordCloud, CLOUD_VIEW } from '../wordCloud'
import type { SkillStat } from '../types'

interface KeywordCloudProps {
  skills: SkillStat[]
  total: number
}

const props = defineProps<KeywordCloudProps>()
const emit = defineEmits<{ (event: 'select', id: string): void }>()

const words = computed(() => buildWordCloud(props.skills))

const description = computed(() => {
  const top = words.value
    .slice(0, 5)
    .map(word => `${word.text} ${word.count} 条`)
    .join('、')
  return `关键词词云：${top}。字号越大表示提及样本越多，可点击查看对应课程与实践。`
})

function choose(id: string): void {
  emit('select', id)
}
</script>

<template>
  <svg
    class="keyword-cloud"
    :viewBox="`0 0 ${CLOUD_VIEW.width} ${CLOUD_VIEW.height}`"
    role="img"
    :aria-label="description"
  >
    <g
      v-for="word in words"
      :key="word.id"
      class="cloud-word"
      tabindex="0"
      role="button"
      :aria-label="`${word.text}，${word.count} / ${total} 条样本提及`"
      @click="choose(word.id)"
      @keydown.enter.prevent="choose(word.id)"
      @keydown.space.prevent="choose(word.id)"
    >
      <title>{{ word.text }}：{{ word.count }} / {{ total }} 条样本提及</title>
      <text
        class="cloud-text"
        :x="word.x"
        :y="word.y"
        :font-size="word.size"
        :fill="word.color"
        text-anchor="middle"
        dominant-baseline="central"
      >{{ word.text }}</text>
    </g>
  </svg>
</template>
