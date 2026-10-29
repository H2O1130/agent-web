import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { clone } from './clone'
import { defaultProfile, demoJobs } from './data'
import { planPhase, replanPhase } from './services/orchestrator'
import type { CareerPath, Job, Plan, Profile, Role, TaskChange } from './types'

const STORAGE_KEY = 'pathpilot-workspace'
const STEP_COUNT = 6
const MAX_WEEKLY_HOURS = 30
const ROLES: Role[] = ['frontend', 'backend']
const CAREER_PATHS: CareerPath[] = ['job', 'graduate', 'undecided']

const READ_WARNING = '上次的本地记录无法读取，已恢复默认状态。你可以重新开始规划。'
const WRITE_WARNING = '浏览器暂时无法保存记录，当前页面仍可使用；导出计划可保留本次成果。'

interface SavedWorkspace {
  profile: Profile
  jobs: Job[]
  plans: Plan[]
  selectedIds: string[]
  activeId?: string
  step?: number
  hasDraft?: boolean
  completed?: Record<string, string[]>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidProfile(value: unknown): value is Profile {
  if (!isRecord(value)) return false
  if (typeof value.major !== 'string') return false
  if (!Number.isInteger(value.semester)) return false
  if ((value.semester as number) < 1 || (value.semester as number) > 8) return false
  if (!ROLES.includes(value.role as Role)) return false
  if (!Array.isArray(value.skills)) return false
  if (!Array.isArray(value.interests)) return false
  if (!value.scores) return false
  if (typeof value.hours !== 'number') return false
  if (value.hours < 0 || value.hours > MAX_WEEKLY_HOURS) return false
  return CAREER_PATHS.includes(value.path as CareerPath)
}

function isValidPlan(value: unknown): value is Plan {
  if (!isRecord(value)) return false
  if (!value.id) return false
  if (!value.profile) return false
  return Array.isArray(value.tasks)
}

function readWorkspace(raw: string): SavedWorkspace {
  const saved = JSON.parse(raw) as Record<string, unknown>

  if (!isValidProfile(saved.profile)) {
    throw new Error('本地记录中的画像不完整')
  }

  if (!Array.isArray(saved.plans) || !saved.plans.every(isValidPlan)) {
    throw new Error('本地记录中的方案不完整')
  }

  if (!Array.isArray(saved.jobs)) {
    throw new Error('本地记录中的岗位样本不完整')
  }

  if (!Array.isArray(saved.selectedIds)) {
    throw new Error('本地记录中的样本选择不完整')
  }

  return saved as unknown as SavedWorkspace
}

function isCompletedByPlan(value: unknown): value is Record<string, string[]> {
  return isRecord(value)
}

export const useWorkspace = defineStore('workspace', () => {
  const profile = ref<Profile>(clone(defaultProfile))
  const jobs = ref<Job[]>(clone(demoJobs))
  const selectedIds = ref<string[]>(demoJobs.filter(job => job.role === 'frontend').map(job => job.id))
  const plans = ref<Plan[]>([])
  const activeId = ref('')
  const step = ref(1)
  const hasDraft = ref(false)
  const completed = ref<Record<string, string[]>>({})
  const storageWarning = ref('')
  const generating = ref(false)

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) restoreWorkspace(readWorkspace(raw))
  } catch {
    storageWarning.value = READ_WARNING
  }

  watch(
    [profile, jobs, selectedIds, plans, activeId, step, hasDraft, completed],
    saveWorkspace,
    { deep: true },
  )

  const selectedJobs = computed(() =>
    jobs.value.filter(job => selectedIds.value.includes(job.id) && job.role === profile.value.role),
  )

  const activePlan = computed(() => plans.value.find(plan => plan.id === activeId.value))

  const stale = computed(() => {
    const current = activePlan.value
    if (!current) return false

    const profileChanged = JSON.stringify(current.profile) !== JSON.stringify(profile.value)
    const currentJobs = [...current.jobIds].sort().join()
    const selectedJobIds = selectedJobs.value.map(job => job.id).sort().join()
    return profileChanged || currentJobs !== selectedJobIds
  })

  function restoreWorkspace(saved: SavedWorkspace): void {
    const imported = (saved.jobs ?? []).filter(
      job => job.source === 'imported' && typeof job.id === 'string' && typeof job.text === 'string',
    )

    profile.value = saved.profile
    jobs.value = [...clone(demoJobs), ...imported]
    selectedIds.value = (saved.selectedIds ?? []).filter(id => typeof id === 'string')
    plans.value = saved.plans ?? []
    activeId.value = typeof saved.activeId === 'string' ? saved.activeId : ''
    step.value = Number.isInteger(saved.step)
      ? Math.min(STEP_COUNT, Math.max(1, saved.step as number))
      : 1
    hasDraft.value = Boolean(saved.hasDraft)
    completed.value = isCompletedByPlan(saved.completed) ? saved.completed : {}
  }

  function saveWorkspace(): void {
    const imported = jobs.value.filter(job => job.source === 'imported')

    const snapshot = {
      profile: profile.value,
      jobs: imported,
      selectedIds: selectedIds.value,
      plans: plans.value,
      activeId: activeId.value,
      step: step.value,
      hasDraft: hasDraft.value,
      completed: completed.value,
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      storageWarning.value = WRITE_WARNING
    }
  }

  function loadDemo(): void {
    const demoProfile: Profile = {
      ...defaultProfile,
      skills: ['programming'],
      scores: { programming: 5, project: 3, analysis: 5, communication: 5 },
      interests: ['技术实现', '创意设计'],
    }

    profile.value = clone(demoProfile)
    selectedIds.value = jobs.value
      .filter(job => job.role === 'frontend' && job.source === 'demo')
      .map(job => job.id)
    hasDraft.value = true
    step.value = 1
  }

  /** 阶段 4：生成新方案（模型模式走 /api/plan，失败直接抛错，不降级）。 */
  async function generate(next: Profile, ids: string[]): Promise<Plan> {
    const chosenJobs = jobs.value.filter(job => ids.includes(job.id) && job.role === next.role)
    const latestVersion = Math.max(0, ...plans.value.map(plan => plan.version))

    generating.value = true
    try {
      const plan = await planPhase(next, chosenJobs, latestVersion + 1)
      plans.value.unshift(plan)
      activeId.value = plan.id
      profile.value = clone(next)
      selectedIds.value = [...ids]
      hasDraft.value = true
      return plan
    } finally {
      generating.value = false
    }
  }

  /** 阶段 6：在同一份方案上调整（模型模式走 /api/plan/replan，返回后端计算的变更）。 */
  async function replan(
    before: Plan,
    next: Profile,
    ids: string[],
  ): Promise<{ plan: Plan; changes: TaskChange[] }> {
    const chosenJobs = jobs.value.filter(job => ids.includes(job.id) && job.role === next.role)

    generating.value = true
    try {
      const result = await replanPhase(before, next, chosenJobs)
      plans.value.unshift(result.plan)
      activeId.value = result.plan.id
      profile.value = clone(next)
      selectedIds.value = [...ids]
      hasDraft.value = true
      return result
    } finally {
      generating.value = false
    }
  }

  function reset(): void {
    profile.value = clone(defaultProfile)
    jobs.value = clone(demoJobs)
    selectedIds.value = demoJobs.filter(job => job.role === 'frontend').map(job => job.id)
    plans.value = []
    activeId.value = ''
    completed.value = {}
    hasDraft.value = false
    step.value = 1
    storageWarning.value = ''
  }

  return {
    profile,
    jobs,
    selectedIds,
    plans,
    activeId,
    step,
    hasDraft,
    completed,
    storageWarning,
    generating,
    selectedJobs,
    activePlan,
    stale,
    loadDemo,
    generate,
    replan,
    reset,
  }
})
