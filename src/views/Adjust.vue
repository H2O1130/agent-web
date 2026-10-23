<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Check, Clock, GitBranch, RefreshCw } from '@lucide/vue'
import ChoiceCard from '../components/ChoiceCard.vue'
import { clone } from '../clone'
import { pathNames, roleNames, taskPeriod } from '../data'
import { diffPlans } from '../planning'
import { useWorkspace } from '../store'
import type { CareerPath, Plan, Profile } from '../types'

const store = useWorkspace()

const statusNames = ['全部', '保留', '推迟', '新增', '移除']
const snapshot = store.activePlan

const original = ref<Plan | undefined>(snapshot ? clone(snapshot) : undefined)
const draft = ref<Profile | undefined>(original.value ? clone(original.value.profile) : undefined)
const result = ref<Plan>()
const error = ref('')
const activeStatus = ref('全部')

const changes = computed(() => {
  if (!original.value || !result.value) return []
  return diffPlans(original.value, result.value)
})

const visibleChanges = computed(() => {
  if (activeStatus.value === '全部') return changes.value
  return changes.value.filter(change => change.status === activeStatus.value)
})

function countOf(status: string): number {
  if (status === '全部') return changes.value.length
  return changes.value.filter(change => change.status === status).length
}

function choosePath(key: string): void {
  if (!draft.value) return
  draft.value.path = key as CareerPath
}

function adjust(): void {
  const nextProfile = draft.value
  const base = original.value
  if (!nextProfile || !base) return

  error.value = ''

  const jobIds = nextProfile.role === base.profile.role
    ? base.jobIds
    : store.jobs.filter(job => job.role === nextProfile.role && job.source === 'demo').map(job => job.id)

  try {
    result.value = store.generate(nextProfile, jobIds)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查调整条件后重试。'
  }
}

function applyHoursDemo(): void {
  if (!draft.value) return

  draft.value.hours = 6
  adjust()
}
</script>

<template>
  <div class="page-container workspace-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">条件变了，方向依然清晰</span>
        <h1>让计划，跟上你的变化<span class="heading-dot">.</span></h1>
        <p>保留已经合适的行动，把需要取舍的部分说清楚。</p>
      </div>
      <RouterLink to="/roadmap" class="button secondary">返回成长路线 <ArrowRight :size="17" /></RouterLink>
    </div>

    <template v-if="original && draft">
      <div class="adjust-layout">
        <section class="panel adjust-controls">
          <div class="panel-heading">
            <h2>这次，什么改变了？</h2>
            <GitBranch :size="20" class="gold-text" />
          </div>

          <label class="field">
            目标岗位
            <select v-model="draft.role">
              <option value="frontend">前端开发</option>
              <option value="backend">Python 后端开发</option>
            </select>
          </label>

          <div class="rating-field">
            <div>
              <label for="adjust-hours">每周课外时间</label>
              <span class="rating-value">{{ draft.hours }} 小时</span>
            </div>

            <input id="adjust-hours" v-model.number="draft.hours" type="range" min="0" max="30" step="1" />

            <label class="field number-row">
              直接填写
              <input v-model.number="draft.hours" type="number" min="0" max="30" aria-label="调整每周小时" />
            </label>
          </div>

          <fieldset class="field">
            <legend>发展路径</legend>
            <div class="adjust-paths">
              <ChoiceCard
                v-for="(name, key) in pathNames"
                :key="key"
                :label="name"
                name="adjust-path"
                :selected="draft.path === key"
                @choose="choosePath(key)"
              />
            </div>
          </fieldset>

          <p class="small-label">考研安排是可修改的路径假设，不代替个人选择。</p>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button class="button primary full-width" @click="adjust">调整成长方案 <ArrowRight :size="17" /></button>
          <button class="demo-adjust" @click="applyHoursDemo">
            <RefreshCw :size="15" />一键演示：每周 12 小时改为 6 小时
          </button>
          <p class="small-label">演示会将时间设为 6 小时；左侧原方案保持不变。</p>
        </section>

        <section class="adjust-results">
          <div class="comparison-conditions">
            <article>
              <span class="small-label">调整前 · V{{ original.version }}</span>
              <h3>{{ roleNames[original.profile.role] }}</h3>
              <div><Clock :size="16" /><strong>{{ original.profile.hours }}</strong> 小时 / 周</div>
              <span class="tag">{{ pathNames[original.profile.path] }}</span>
            </article>

            <span class="comparison-arrow"><ArrowRight :size="23" /></span>

            <article :class="{ 'after-ready': result }">
              <span class="small-label">{{ result ? `调整后 · V${result.version}` : '待生成的新方案' }}</span>
              <h3>{{ roleNames[result?.profile.role ?? draft.role] }}</h3>
              <div><Clock :size="16" /><strong>{{ result?.profile.hours ?? draft.hours }}</strong> 小时 / 周</div>
              <span class="tag">{{ pathNames[result?.profile.path ?? draft.path] }}</span>
            </article>
          </div>

          <div v-if="!result" class="adjust-placeholder">
            <span class="icon-tile"><GitBranch :size="30" :stroke-width="1.4" /></span>
            <h2>调整不是推倒重来</h2>
            <p>修改左侧条件后，查看哪些任务保留、<br />哪些需要推迟，以及每一项变化的原因。</p>
            <div><Check :size="15" />旧方案始终保留 <span>·</span> 按实际规则重新计算</div>
          </div>

          <template v-else>
            <div class="notice-bar success-notice" role="status">
              <span><Check :size="16" />新方案已保存，原方案未修改。</span>
              <RouterLink to="/roadmap">查看完整新路线 <ArrowRight :size="15" /></RouterLink>
            </div>

            <div class="change-filters">
              <button
                v-for="status in statusNames"
                :key="status"
                :class="{ active: activeStatus === status }"
                @click="activeStatus = status"
              >{{ status }}<span>{{ countOf(status) }}</span></button>
            </div>

            <div class="change-list">
              <article v-for="change in visibleChanges" :key="change.id" class="change-card">
                <div>
                  <span class="status-tag" :class="`status-${change.status}`">{{ change.status }}</span>
                  <h3>{{ change.title }}</h3>
                </div>

                <div class="change-periods">
                  <span><small>调整前</small>{{ change.before ? taskPeriod(change.before) : '原方案无此任务' }}</span>
                  <ArrowDown :size="15" />
                  <span><small>调整后</small>{{ change.after ? taskPeriod(change.after) : '已移出本方案' }}</span>
                </div>

                <p>{{ change.reason }}</p>
              </article>

              <p v-if="!visibleChanges.length" class="empty-small">本次没有“{{ activeStatus }}”的任务。</p>
            </div>
          </template>
        </section>
      </div>
    </template>

    <section v-else class="empty-state panel">
      <GitBranch :size="40" />
      <h2>先有一份计划，再看看如何调整</h2>
      <p>完成画像与岗位选择后，即可比较不同条件下的路线。</p>
      <RouterLink to="/plan" class="button primary">开始规划 <ArrowRight :size="17" /></RouterLink>
    </section>
  </div>
</template>
