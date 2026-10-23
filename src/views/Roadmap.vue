<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Download,
  Flag,
  GitBranch,
  Route,
  Target,
} from '@lucide/vue'
import { useWorkspace } from '../store'
import { pathNames, roleNames, taskPeriod } from '../data'
import type { Plan, PlannedTask } from '../types'

const SEMESTER_COUNT = 8
const WEEKS_PER_SEMESTER = 16

const store = useWorkspace()

const plan = computed(() => store.activePlan)
const done = computed(() => {
  const current = plan.value
  if (!current) return []
  return store.completed[current.id] ?? []
})
const scheduled = computed(() => plan.value?.tasks.filter(task => task.semester !== null) ?? [])
const pending = computed(() => plan.value?.tasks.filter(task => task.semester === null) ?? [])
const completedCount = computed(
  () => scheduled.value.filter(task => done.value.includes(task.id)).length,
)

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

function tasksOf(semester: number): PlannedTask[] {
  return scheduled.value.filter(task => task.semester === semester)
}

function semesterSummary(semester: number): string {
  const current = plan.value
  if (!current) return ''

  if (semester < current.profile.semester) return '已过去，待核对 · 不自动认定任务已完成'

  const tasks = tasksOf(semester)
  if (!tasks.length) return '暂未安排 · 为后续变化留出空间'

  return `${tasks.length} 项行动 · 峰值每周 ${peak(tasks)} 小时`
}

function isOpen(semester: number): boolean {
  const current = plan.value
  if (!current) return false
  if (semester === current.profile.semester) return true

  const firstPlanned = scheduled.value.find(task => (task.semester ?? 0) > current.profile.semester)
  return semester > current.profile.semester && semester === firstPlanned?.semester
}

function peak(tasks: PlannedTask[]): number {
  const weekly = Array.from({ length: WEEKS_PER_SEMESTER }, (_, index) => {
    const week = index + 1
    return tasks
      .filter(task => task.startWeek !== null && week >= task.startWeek && week < task.startWeek + task.weeks)
      .reduce((sum, task) => sum + task.hours, 0)
  })

  return Math.max(0, ...weekly)
}

function weekRange(task: PlannedTask): string {
  const start = task.startWeek ?? 0
  return `${start}—${start + task.weeks - 1} 周`
}

function taskTitle(id: string): string {
  const found = plan.value?.tasks.find(task => task.id === id)
  return found?.title ?? id
}

function prerequisiteLabel(task: PlannedTask): string {
  if (!task.prerequisites.length) return '从当前基础开始'
  return `前置：${task.prerequisites.map(id => taskTitle(id)).join('、')}`
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
    '> 演示模式：本地样本与规则计算，不代表实时招聘分析。',
    '',
    `专业：${current.profile.major}`,
    `当前学期：${current.profile.semester}`,
    `目标：${roleNames[current.profile.role]}`,
    `每周课外时间：${current.profile.hours} 小时`,
    `路径：${pathNames[current.profile.path]}`,
    `生成时间：${new Date(current.createdAt).toLocaleString('zh-CN')}`,
    '',
  ]

  for (const task of current.tasks) {
    lines.push(`## ${task.title}`)
    lines.push(`- 安排：${taskPeriod(task)}`)
    lines.push(`- 每周：${task.hours} 小时，持续 ${task.weeks} 周`)
    lines.push(`- 成果：${task.outcome}`)
    lines.push(`- 验收：${task.acceptance}`)
    lines.push(`- 依据：${task.jobIds.join('、') || '基础支持 / 用户路径选择'}`)
    lines.push(`- 原因：${task.reason}`)
    lines.push(`- 状态：${done.value.includes(task.id) ? '已完成（本人标记）' : '待执行'}`)
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

      <div class="route-layout">
        <section class="semester-timeline">
          <div class="section-heading">
            <div>
              <span class="eyebrow">以学期为单位，向目标靠近</span>
              <h2>大学四年成长路线</h2>
            </div>
            <span class="tag">课程映射为示例</span>
          </div>

          <details
            v-for="semester in SEMESTER_COUNT"
            :key="semester"
            class="semester-block"
            :class="{ past: semester < plan.profile.semester, 'current-semester': semester === plan.profile.semester }"
            :open="isOpen(semester)"
          >
            <summary>
              <span class="semester-marker">
                <Check v-if="semester < plan.profile.semester" :size="15" />
                <template v-else>{{ semester }}</template>
              </span>
              <div>
                <h3>
                  第 {{ semester }} 学期
                  <span v-if="semester === plan.profile.semester" class="soft-tag">从这里开始</span>
                </h3>
                <p>{{ semesterSummary(semester) }}</p>
              </div>
              <ChevronDown :size="18" />
            </summary>

            <div class="semester-body">
              <p v-if="semester < plan.profile.semester" class="muted">回顾这一阶段的课程与经历，在画像中记录已经接触的技能。</p>
              <p v-else-if="!tasksOf(semester).length" class="muted">当前样本对应的行动已安排在其他学期。积累实际成果后，再核对目标岗位与能力需求。</p>

              <article
                v-for="task in tasksOf(semester)"
                :key="task.id"
                class="task-card"
                :class="{ done: done.includes(task.id) }"
              >
                <div class="task-card-heading">
                  <label class="task-checkbox">
                    <input
                      type="checkbox"
                      :checked="done.includes(task.id)"
                      :aria-label="`标记完成：${task.title}`"
                      @change="toggleTask(task.id)"
                    />
                    <span><Check v-if="done.includes(task.id)" :size="14" /></span>
                  </label>

                  <div>
                    <span class="small-label">
                      第 {{ weekRange(task) }}
                      <span class="tiny-separator">/</span>
                      {{ task.kind }}
                    </span>
                    <h4>{{ task.title }}</h4>
                  </div>

                  <span class="task-hours"><Clock :size="13" />{{ task.hours }}h / 周</span>
                </div>

                <div class="task-body">
                  <p><strong>交付成果</strong>{{ task.outcome }}</p>
                  <p><strong>如何验收</strong>{{ task.acceptance }}</p>
                  <p><strong>课程关联</strong>{{ task.course }}</p>
                  <p v-if="task.kind === '可选'" class="task-reason">{{ task.reason }}</p>

                  <div class="task-bottom">
                    <span>{{ prerequisiteLabel(task) }}</span>
                    <RouterLink
                      v-if="task.jobIds.length"
                      :to="`/analysis?skill=${task.skillIds[0]}&plan=${plan.id}`"
                    >查看岗位依据 <ArrowUpRight :size="14" /></RouterLink>
                    <span v-else>基础支持 / 路径选择</span>
                  </div>
                </div>
              </article>
            </div>
          </details>
        </section>

        <aside class="route-aside">
          <section class="panel next-action">
            <span class="icon-tile"><Flag :size="23" /></span>
            <span class="eyebrow">先从一件事开始</span>
            <h3>{{ nextActionTitle }}</h3>
            <p>{{ nextActionOutcome }}</p>
            <RouterLink :to="`/analysis?plan=${plan.id}`" class="subtle-link">
              回看岗位要求 <ArrowRight :size="15" />
            </RouterLink>
          </section>

          <section class="panel route-explainer">
            <h3>为什么这样安排？</h3>
            <div>
              <span><Check :size="15" /></span>
              <p><strong>先基础，后专项</strong>任务按前置关系安排，减少跳过基础带来的困难。</p>
            </div>
            <div>
              <span><Check :size="15" /></span>
              <p><strong>按真实时间做取舍</strong>同一周任务工时总和不超过 {{ plan.profile.hours }} 小时。</p>
            </div>
            <div>
              <span><Check :size="15" /></span>
              <p><strong>每项行动有成果</strong>用可以检查的作品和过程记录，核对自己的成长。</p>
            </div>
          </section>

          <section class="adjust-invitation">
            <GitBranch :size="23" />
            <h3>计划跟着你变化。</h3>
            <p>时间少了一点，或想试试另一个岗位？不必从头开始。</p>
            <RouterLink to="/adjust">调整我的方案 <ArrowRight :size="16" /></RouterLink>
          </section>
        </aside>
      </div>

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
            <span class="small-label">需要 {{ task.hours }} 小时 / 周 · 持续 {{ task.weeks }} 周</span>
          </article>
        </div>
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
