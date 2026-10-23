<script setup lang="ts">
import { Check } from '@lucide/vue'

interface ChoiceCardProps {
  label: string
  description?: string
  selected: boolean
  type?: 'radio' | 'checkbox'
  disabled?: boolean
  name?: string
}

defineProps<ChoiceCardProps>()

defineEmits<{ choose: [] }>()
</script>

<template>
  <label class="choice-card" :class="{ selected, disabled }">
    <input
      :type="type || 'radio'"
      :name="name"
      :checked="selected"
      :disabled="disabled"
      @change="$emit('choose')"
    />

    <span class="choice-content">
      <strong>{{ label }}</strong>
      <span v-if="description">{{ description }}</span>
    </span>

    <span class="choice-indicator" :class="{ square: type === 'checkbox' }">
      <Check v-if="selected" :size="14" />
    </span>
  </label>
</template>
