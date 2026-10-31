<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Check, Clock, GitBranch, RefreshCw, Sparkles } from '@lucide/vue'
import { DEFAULT_ADJUST_MODE, createModePicker, type AdjustMode } from '../adjustMode'
import ChatAssistant from '../components/ChatAssistant.vue'
import ChoiceCard from '../components/ChoiceCard.vue'
import { clone } from '../clone'
import { pathNames, roleNames, taskPeriod } from '../data'
import { diffPlans } from '../planning'
import { useWorkspace } from '../store'
import type { CareerPath, Plan, Profile } from '../types'

const store = useWorkspace()

const AI_PROMPTS = [
  '每周时间排太满，帮我减一减',
  '想加一个竞赛或项目经历',
  '方向还没定，想先都试试',
  '想早点开始准备考研',
]

const statusNames = ['全部', '保留', '推迟', '新增', '移除']
const snapshot = store.activePlan

const original = ref<Plan | undefined>(snapshot ? clone(snapshot) : undefined)
const draft = ref<Profile | undefined>(original.value ? clone(original.value.profile) : undefined)
const result = ref<Plan>()
const error = ref('')
const activeStatus = ref('全部')
const chatWrap = ref<HTMLElement>()
const chatPanel = ref<InstanceType<typeof ChatAssistant>>()

const mode = ref<AdjustMode>(DEFAULT_ADJUST_MODE)
const pickMode = createModePicker()

/** 默认停在「和 AI 聊聊」；单点切换，双击/连击回到默认。 */
function pick(target: AdjustMode): void {
  mode.value = pickMode(mode.value, target, Date.now())
}

/** 生成完直接看变化，不参与连击判定。 */
function showManual(): void {
  mode.value = 'manual'
}

function openAi(): void {
  chatWrap.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  chatPanel.value?.focusInput()
}

function onAiApplied(next: Plan): void {
  activeStatus.value = '全部'
  result.value = next
  draft.value = clone(next.profile)
}

const changes = computed(() => {
  if (!original.value || !result.value) return []
  return diffPlans(original.value, result.value)
})
const chatPlan = computed(() => store.activePlan ?? original.value)

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

async function adjust(): Promise<void> {
  const nextProfile = draft.value
  const base = original.value
  if (!nextProfile || !base) return

  error.value = ''

  const jobIds = base.jobIds

  try {
    // 已经通过对话换掉的模块、补充的任务要跟着走，否则改个时长就全丢
    const latest = result.value ?? base
    result.value = await store.generate(nextProfile, jobIds, {
      customTasks: latest.customTasks,
      dropModules: latest.dropModules,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查调整条件后重试。'
  }
}

async function applyHoursDemo(): Promise<void> {
  if (!draft.value) return

  draft.value.hours = 6
  await adjust()
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

          <div class="adjust-modes">
            <div class="adjust-switch" role="tablist" aria-label="选择调整方式">
              <button
                type="button"
                role="tab"
                :aria-selected="mode === 'manual'"
                :class="{ active: mode === 'manual' }"
                @click="pick('manual')"
              >调整成长方案</button>
              <button
                type="button"
                role="tab"
                :aria-selected="mode === 'ai'"
                :class="{ active: mode === 'ai' }"
                @click="pick('ai')"
              ><Sparkles :size="15" />和 AI 聊聊</button>
            </div>

            <p v-if="error" class="form-error" role="alert">{{ error }}</p>

            <div v-if="mode === 'manual'" class="adjust-action">
              <button class="button primary full-width" :disabled="store.generating" @click="adjust">
                {{ store.generating ? '正在生成…' : '按这些条件重新生成' }}<ArrowRight :size="17" />
              </button>
              <button class="demo-adjust" :disabled="store.generating" @click="applyHoursDemo">
                <RefreshCw :size="15" />一键演示：每周 12 小时改为 6 小时
              </button>
              <p class="small-label">演示会将时间设为 6 小时；左侧原方案保持不变。</p>
            </div>

            <div v-else class="adjust-action">
              <p class="small-label">
                直接说出你的顾虑（太满、方向不确定、想加竞赛…），AI 会结合现有方案给建议；确认后按同样的规则生成新版本。
              </p>
              <button class="button primary full-width" @click="openAi">
                <Sparkles :size="16" />打开对话，聊聊这次调整
              </button>
              <p class="small-label">对话在右侧，旧方案会保留，确认后才生成新版本。</p>
            </div>
          </div>
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

          <div v-show="mode === 'manual'" class="adjust-pane">
            <template v-if="result">
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

            <div v-else class="adjust-empty">
              <span class="icon-tile"><GitBranch :size="26" :stroke-width="1.4" /></span>
              <div>
                <h3>还没有生成新方案</h3>
                <p>在左侧选好条件，点「调整成长方案」。这里会列出哪些保留、哪些推迟，以及每一项变化的原因。</p>
              </div>
            </div>
          </div>

          <div v-show="mode === 'ai'" class="adjust-pane">
            <div v-if="result" class="notice-bar success-notice" role="status">
              <span><Check :size="16" />已生成 V{{ result.version }}，旧方案保留。</span>
              <button type="button" class="text-button" @click="showManual">
                查看变化 <ArrowRight :size="15" />
              </button>
            </div>

            <div v-if="chatPlan" ref="chatWrap" class="adjust-ai">
              <ChatAssistant
                ref="chatPanel"
                variant="hero"
                :plan="chatPlan"
                :prompts="AI_PROMPTS"
                @applied="onAiApplied"
              />

              <ul class="ai-guarantees">
                <li><Check :size="14" />旧方案始终保留</li>
                <li><Check :size="14" />按实际规则重新计算</li>
                <li><Check :size="14" />确认后才生成新版本</li>
              </ul>
            </div>
          </div>
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
