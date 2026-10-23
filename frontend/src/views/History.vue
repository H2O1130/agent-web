<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Check, Clock, GitBranch, History, Trash2 } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { pathNames, roleNames } from '../data'
import { diffPlans } from '../planning'
import { useWorkspace } from '../store'
import type { Plan } from '../types'

const store = useWorkspace()
const router = useRouter()

const selected = ref<string[]>([])
const showComparison = ref(false)

const compareLabel = computed(() => (showComparison.value ? '收起对比' : '对比选中方案'))

const comparison = computed(() => {
  if (selected.value.length !== 2) return []

  const [beforeId, afterId] = selected.value
  const before = store.plans.find(plan => plan.id === beforeId)
  const after = store.plans.find(plan => plan.id === afterId)
  if (!before || !after) return []

  return diffPlans(before, after)
})

function scheduledCount(plan: Plan): number {
  return plan.tasks.filter(task => task.semester !== null).length
}

function pendingCount(plan: Plan): number {
  return plan.tasks.filter(task => task.semester === null).length
}

function openPlan(id: string): void {
  store.activeId = id
  router.push('/roadmap')
}

function removePlan(id: string): void {
  const confirmed = window.confirm('删除这份历史方案？此操作仅影响本机记录。')
  if (!confirmed) return

  store.plans = store.plans.filter(plan => plan.id !== id)
  delete store.completed[id]
  selected.value = selected.value.filter(item => item !== id)

  if (store.activeId === id) {
    store.activeId = store.plans[0]?.id ?? ''
  }
}
</script>

<template>
  <div class="page-container workspace-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">每一次选择，都有迹可循</span>
        <h1>回看你的成长计划<span class="heading-dot">.</span></h1>
        <p>方案保存在当前浏览器，方便回顾、比较与继续行动。</p>
      </div>
      <RouterLink to="/plan" class="button primary">创建新计划 <ArrowRight :size="17" /></RouterLink>
    </div>

    <div v-if="store.plans.length" class="history-toolbar">
      <span>{{ store.plans.length }} 份已保存方案</span>
      <button
        class="button secondary small"
        :disabled="selected.length !== 2"
        @click="showComparison = !showComparison"
      >
        <GitBranch :size="16" />{{ compareLabel }}（{{ selected.length }} / 2）
      </button>
    </div>

    <div v-if="showComparison && selected.length === 2" class="panel history-comparison">
      <h2>两份计划，有什么不同？</h2>

      <article v-for="change in comparison" :key="change.id">
        <span class="status-tag" :class="`status-${change.status}`">{{ change.status }}</span>
        <div>
          <strong>{{ change.title }}</strong>
          <p>{{ change.reason }}</p>
        </div>
      </article>
    </div>

    <div class="history-grid">
      <article v-for="plan in store.plans" :key="plan.id" class="panel history-card">
        <div class="history-card-top">
          <label>
            <input
              v-model="selected"
              type="checkbox"
              :value="plan.id"
              :disabled="selected.length >= 2 && !selected.includes(plan.id)"
              :aria-label="`选择方案 V${plan.version} 参与对比`"
            />参与对比</label>
          <span v-if="store.activeId === plan.id" class="soft-tag"><Check :size="12" />当前查看</span>
        </div>

        <span class="small-label">PLAN / V{{ String(plan.version).padStart(2, '0') }}</span>
        <h2>{{ roleNames[plan.profile.role] }}</h2>

        <div class="history-meta">
          <span>第 {{ plan.profile.semester }} 学期</span>
          <span><Clock :size="14" />{{ plan.profile.hours }} 小时 / 周</span>
          <span>{{ pathNames[plan.profile.path] }}</span>
        </div>

        <p>{{ scheduledCount(plan) }} 项已安排行动 · {{ pendingCount(plan) }} 项待安排</p>
        <time :datetime="plan.createdAt">{{ new Date(plan.createdAt).toLocaleString('zh-CN') }}</time>

        <div class="history-card-actions">
          <button class="text-button" @click="openPlan(plan.id)">查看这份路线 <ArrowRight :size="16" /></button>
          <button
            class="icon-button"
            :aria-label="`删除方案 V${plan.version}`"
            @click="removePlan(plan.id)"
          >
            <Trash2 :size="17" />
          </button>
        </div>
      </article>
    </div>

    <section v-if="!store.plans.length" class="empty-state panel">
      <History :size="40" :stroke-width="1.3" />
      <h2>你的第一份计划，还在前方</h2>
      <p>完成一次规划后，方案和调整记录会出现在这里。</p>
      <RouterLink to="/plan" class="button primary">开始我的规划 <ArrowRight :size="17" /></RouterLink>
    </section>
  </div>
</template>
