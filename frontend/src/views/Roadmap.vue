<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Download,
  Flag,
  GitBranch,
  Route,
  Target,
} from '@lucide/vue'
import ChatAssistant from '../components/ChatAssistant.vue'
import { useWorkspace } from '../store'
import { pathNames, roleNames } from '../data'
import type { Plan, PlannedTask } from '../types'

const SEMESTER_LABELS = ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四上', '大四下']

interface PlanPeriod {
  key: string
  kind: 'semester' | 'summer' | 'winter'
  label: string
  title: string
  goal: string
  output: string
  decision: string
  itemIds: string[]
  periodIndex: number
  semester: number
}

const store = useWorkspace()

const plan = computed(() => store.activePlan)
const overview = computed(() => plan.value?.overview)
const done = computed(() => {
  const current = plan.value
  if (!current) return []
  return store.completed[current.id] ?? []
})
const taskMap = computed(() => new Map(plan.value?.tasks.map(task => [task.id, task]) ?? []))
const scheduled = computed(() => plan.value?.tasks.filter(task => task.semester !== null) ?? [])
const pending = computed(() => plan.value?.tasks.filter(task => task.semester === null) ?? [])
const completedCount = computed(
  () => scheduled.value.filter(task => done.value.includes(task.id)).length,
)
const periods = computed<PlanPeriod[]>(() => {
  const current = plan.value
  if (!current) return []

  const list: PlanPeriod[] = []
  for (const semester of current.semesters ?? []) {
    list.push({
      key: `semester-${semester.semester}`,
      kind: 'semester',
      label: semesterLabel(semester.semester),
      title: semester.title,
      goal: semester.goal,
      output: semester.output,
      decision: semester.decision,
      itemIds: semester.itemIds,
      periodIndex: (semester.semester - 1) * 2,
      semester: semester.semester,
    })
  }
  for (const vacation of current.vacations ?? []) {
    list.push({
      key: vacation.id,
      kind: vacation.kind,
      label: vacation.label,
      title: vacation.title,
      goal: vacation.goal,
      output: vacation.output,
      decision: vacation.decision,
      itemIds: vacation.itemIds,
      periodIndex: (vacation.afterSemester - 1) * 2 + 1,
      semester: vacation.afterSemester,
    })
  }
  if (list.length) return list.sort((a, b) => a.periodIndex - b.periodIndex)

  const groups = new Map<number, PlannedTask[]>()
  for (const task of current.tasks) {
    if (task.semester === null) continue
    if ((task.periodKind ?? 'semester') !== 'semester') continue
    const group = groups.get(task.semester) ?? []
    group.push(task)
    groups.set(task.semester, group)
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([semester, tasks]) => ({
      key: `semester-${semester}`,
      kind: 'semester',
      label: semesterLabel(semester),
      title: `第 ${semester} 学期`,
      goal: '',
      output: tasks.map(task => task.outcome).join('；'),
      decision: '',
      itemIds: tasks.map(task => task.id),
      periodIndex: (semester - 1) * 2,
      semester,
    }))
})
const nextTask = computed(() => scheduled.value.find(task => !done.value.includes(task.id)))
const nextActionTitle = computed(() => {
  if (nextTask.value) return nextTask.value.title
  return plan.value?.profile.hours === 0 ? '给自己留一点调整空间' : '已完成当前安排的行动'
})
const nextActionOutcome = computed(() => {
  if (nextTask.value) return nextTask.value.outcome
  if (plan.value?.profile.hours === 0) return '当前课外任务已暂停。准备好后，调整每周时间再出发。'
  return '回看成果、核对岗位要求，再决定下一阶段的目标。'
})

function semesterLabel(semester: number): string {
  return SEMESTER_LABELS[semester - 1] ?? `第 ${semester} 学期`
}

function tasksOf(period: PlanPeriod): PlannedTask[] {
  return period.itemIds
    .map(id => taskMap.value.get(id))
    .filter((task): task is PlannedTask => Boolean(task))
}

function weekNote(task: PlannedTask): string {
  return task.weekNote || `约 ${task.weeks} 周`
}

function toggleTask(id: string): void {
  const current = plan.value
  if (!current) return

  const finished = store.completed[current.id] ?? []
  if (finished.includes(id)) {
    store.completed[current.id] = finished.filter(item => item !== id)
    return
  }

  store.completed[current.id] = [...finished, id]
}

function buildExport(current: Plan): string {
  const lines: string[] = [
    `# 学途 PathPilot · 成长计划 V${current.version}`,
    '',
    '> 演示模式：样本与课程为示例，方案由规则或模型生成。',
    '',
    `专业：${current.profile.major}`,
    `当前学期：${current.profile.semester}`,
    `目标：${roleNames[current.profile.role]}`,
    `每周课外时间：${current.profile.hours} 小时`,
    `路径：${pathNames[current.profile.path]}`,
    `生成时间：${new Date(current.createdAt).toLocaleString('zh-CN')}`,
    '',
  ]

  if (current.overview) {
    const currentOverview = current.overview
    lines.push('## 规划总览')
    lines.push(currentOverview.goal)
    lines.push('')
    lines.push(currentOverview.strategy)
    lines.push('')
    lines.push('### 核心原则')
    for (const item of currentOverview.principles) lines.push(`- ${item}`)
    lines.push('')
    if (currentOverview.stack.length) {
      lines.push('### 能力与技术栈')
      lines.push(currentOverview.stack.join('、'))
      lines.push('')
    }
    if (currentOverview.milestones.length) {
      lines.push('### 关键产出节点')
      for (const item of currentOverview.milestones) {
        lines.push(`- 第 ${item.semester} 学期：${item.title}（${item.evidence}）`)
      }
      lines.push('')
    }
    lines.push('### 决策点')
    lines.push(currentOverview.decisionPoint)
    lines.push('')
  }

  for (const period of periods.value) {
    lines.push(`## ${period.label} · ${period.title}`)
    if (period.goal) lines.push(period.goal)
    lines.push('')

    for (const task of tasksOf(period)) {
      lines.push(`### ${task.title}（${weekNote(task)}）`)
      if (task.example) lines.push(`- 示例：${task.example}`)
      lines.push(`- 做什么：${task.outcome}`)
      lines.push(`- 完成：${task.acceptance}`)
      if (task.course) lines.push(`- 课程：${task.course}`)
      lines.push(`- 原因：${task.reason}`)
      lines.push(`- 状态：${done.value.includes(task.id) ? '已完成（本人标记）' : '待执行'}`)
      lines.push('')
    }

    if (period.output) {
      lines.push(`> 阶段产出：${period.output}`)
      lines.push('')
    }
    if (period.decision) {
      lines.push(`> 决策点：${period.decision}`)
      lines.push('')
    }
  }

  if (pending.value.length) {
    lines.push('## 待安排')
    for (const task of pending.value) {
      lines.push(`- ${task.title}：${task.reason}`)
    }
    lines.push('')
  }

  lines.push('课程关联为示例，请按本校培养方案核对。目标与发展路径由学生自行决定。')
  return lines.join('\n')
}

function exportPlan(): void {
  const current = plan.value
  if (!current) return

  const markdown = buildExport(current)
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = `学途-成长计划-V${current.version}.md`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page-container workspace-page">
    <template v-if="plan">
      <div class="page-heading">
        <div>
          <span class="eyebrow">从看见方向，到开始行动</span>
          <h1>你的成长，有路可循<span class="heading-dot">.</span></h1>
          <p>一份可以执行、可以解释，也可以随着你改变的计划。</p>
        </div>

        <div class="heading-actions">
          <button class="button secondary" @click="exportPlan"><Download :size="16" />导出计划</button>
          <RouterLink to="/adjust" class="button primary"><GitBranch :size="17" />调整方案</RouterLink>
        </div>
      </div>

      <div v-if="store.stale" class="notice-bar">
        <span>条件已更新，待重新生成。下方仍为 V{{ plan.version }} 的已保存快照。</span>
        <RouterLink to="/plan">核对并重新生成 <ArrowRight :size="15" /></RouterLink>
      </div>

      <section class="plan-hero">
        <div class="plan-hero-main">
          <span class="tag light-tag">成长路线 · V{{ plan.version }}</span>
          <h2>{{ roleNames[plan.profile.role] }}<span>从现在开始，积累你的下一份成果</span></h2>
          <div class="plan-meta">
            <span><BookOpen :size="15" />{{ plan.profile.major }}</span>
            <span><CalendarDays :size="15" />第 {{ plan.profile.semester }} 学期</span>
            <span><Clock :size="15" />每周 {{ plan.profile.hours }} 小时</span>
            <span><Target :size="15" />{{ pathNames[plan.profile.path] }}</span>
          </div>
        </div>

        <div class="plan-progress">
          <span class="small-label">行动进度 · 本人标记</span>
          <strong>{{ completedCount }}<span> / {{ scheduled.length }}</span></strong>
          <progress :value="completedCount" :max="scheduled.length || 1" />
          <small>每一次完成，都值得被记录</small>
        </div>
      </section>

      <ChatAssistant :plan="plan" />

      <section v-if="overview" class="plan-overview">
        <div class="overview-heading">
          <div>
            <span class="eyebrow">先看整体，再执行每学期</span>
            <h2>这份规划怎么打</h2>
          </div>
          <span class="tag">{{ overview.stack.length }} 项能力</span>
        </div>

        <p class="overview-strategy">{{ overview.strategy }}</p>

        <div class="overview-columns">
          <section>
            <h3>核心原则</h3>
            <ul class="overview-list">
              <li v-for="item in overview.principles" :key="item">{{ item }}</li>
            </ul>
          </section>
          <section>
            <h3>能力与技术栈</h3>
            <div class="overview-stack">
              <span v-for="item in overview.stack" :key="item" class="tag">{{ item }}</span>
            </div>
          </section>
        </div>

        <section v-if="overview.milestones.length" class="overview-milestones">
          <h3>关键产出节点</h3>
          <div class="milestone-row">
            <article v-for="item in overview.milestones" :key="item.semester">
              <span>{{ item.label || semesterLabel(item.semester) }}</span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.evidence }}</small>
            </article>
          </div>
        </section>

        <p class="overview-decision"><strong>决策点</strong>{{ overview.decisionPoint }}</p>
      </section>

      <section class="semester-document">
        <div class="section-heading">
          <div>
            <span class="eyebrow">以学期为单位，向目标靠近</span>
            <h2>大学四年成长路线</h2>
          </div>
          <span class="tag">课程映射为示例</span>
        </div>

        <p v-if="!periods.length" class="muted">
          当前每周预算为 0 或暂未安排学期；恢复时间后重新生成即可。
        </p>

        <article
          v-for="period in periods"
          :key="period.key"
          class="semester-section"
          :class="{
            past: period.kind === 'semester' && period.semester < plan.profile.semester,
            'current-semester': period.kind === 'semester' && period.semester === plan.profile.semester,
            vacation: period.kind !== 'semester',
          }"
        >
          <header class="semester-heading">
            <span class="semester-index">{{ period.label }}</span>
            <div>
              <span class="small-label">
                <template v-if="period.kind === 'semester'">
                  第 {{ period.semester }} 学期
                  <span v-if="period.semester === plan.profile.semester"> · 从这里开始</span>
                  <span v-else-if="period.semester < plan.profile.semester"> · 已过去，待核对</span>
                </template>
                <template v-else>假期集中安排</template>
              </span>
              <h2>{{ period.title }}</h2>
              <p v-if="period.goal">{{ period.goal }}</p>
            </div>
          </header>

          <ul class="semester-items">
            <li
              v-for="task in tasksOf(period)"
              :key="task.id"
              :class="{ done: done.includes(task.id) }"
            >
              <label class="task-checkbox">
                <input
                  type="checkbox"
                  :checked="done.includes(task.id)"
                  :aria-label="`标记完成：${task.title}`"
                  @change="toggleTask(task.id)"
                />
                <span><Check v-if="done.includes(task.id)" :size="14" /></span>
              </label>

              <div class="item-main">
                <span class="module-tag">{{ task.moduleName || task.kind }}</span>
                <div class="item-title-row">
                  <h3>{{ task.title }}</h3>
                  <span class="week-note">{{ weekNote(task) }}</span>
                </div>
                <p class="item-action">{{ task.outcome }}</p>
                <p class="item-done"><strong>完成</strong>{{ task.acceptance }}</p>

                <details class="item-details">
                  <summary>详情</summary>
                  <p v-if="task.example"><strong>示例</strong>{{ task.example }}</p>
                  <p v-if="task.reason"><strong>为什么</strong>{{ task.reason }}</p>
                  <div class="item-footer">
                    <span>{{ task.course || '课程关联待核对' }}</span>
                    <RouterLink
                      v-if="task.jobIds.length"
                      :to="`/analysis?skill=${task.skillIds[0]}&plan=${plan.id}`"
                    >查看岗位依据 <ArrowUpRight :size="14" /></RouterLink>
                  </div>
                </details>
              </div>
            </li>
          </ul>

          <div v-if="period.output" class="semester-output">
            <strong>阶段产出</strong>{{ period.output }}
          </div>
          <p v-if="period.decision" class="semester-decision">
            <strong>决策点</strong>{{ period.decision }}
          </p>
        </article>
      </section>

      <section v-if="pending.length" class="panel pending-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">把取舍说清楚</span>
            <h2>还有 {{ pending.length }} 项行动，暂不排入</h2>
          </div>
          <span class="tag">待安排</span>
        </div>

        <div class="pending-grid">
          <article v-for="task in pending" :key="task.id">
            <h3>{{ task.title }}</h3>
            <p>{{ task.reason }}</p>
            <span class="small-label">约 {{ task.weeks }} 周</span>
          </article>
        </div>
      </section>

      <section class="document-footer">
        <div>
          <Flag :size="20" />
          <div>
            <span class="eyebrow">先从一件事开始</span>
            <h3>{{ nextActionTitle }}</h3>
            <p>{{ nextActionOutcome }}</p>
          </div>
        </div>
        <RouterLink to="/adjust" class="button secondary">调整我的方案 <ArrowRight :size="16" /></RouterLink>
      </section>
    </template>

    <section v-else class="empty-state panel">
      <Route :size="42" :stroke-width="1.4" />
      <span class="eyebrow">你的下一章，从这里开始</span>
      <h1>先认识你，再规划你的路线</h1>
      <p>填写专业、年级、目标和每周时间，选择岗位样本，即可生成一份成长计划。</p>
      <RouterLink to="/plan" class="button primary">开始我的规划 <ArrowRight :size="18" /></RouterLink>
    </section>
  </div>
</template>
