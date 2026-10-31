import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { remotePlanEnabled, requestPlan, type PlanExtras } from './api'
import { clone } from './clone'
import { canPlanJob, defaultJobIds, defaultProfile, demoJobs, presetJobs } from './data'
import { createPlan } from './planning'
import type { CareerPath, Job, Plan, Profile, Role } from './types'

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
  const jobs = ref<Job[]>(clone(presetJobs))
  const selectedIds = ref<string[]>(defaultJobIds('frontend'))
  const plans = ref<Plan[]>([])
  const activeId = ref('')
  const step = ref(1)
  const hasDraft = ref(false)
  const completed = ref<Record<string, string[]>>({})
  const storageWarning = ref('')
  const generating = ref(false)
  let workspaceRevision = 0

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
    jobs.value.filter(job => selectedIds.value.includes(job.id) && canPlanJob(job, profile.value.role)),
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
    jobs.value = [...clone(presetJobs), ...imported]
    const restoredIds = (saved.selectedIds ?? []).filter(id => typeof id === 'string')
    const legacyIds = new Set(demoJobs.map(job => job.id))
    selectedIds.value = restoredIds.some(id => legacyIds.has(id))
      ? [...new Set([...defaultJobIds(saved.profile.role), ...restoredIds.filter(id => !legacyIds.has(id))])]
      : restoredIds
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
    selectedIds.value = defaultJobIds('frontend', jobs.value)
    hasDraft.value = true
    step.value = 1
  }

  async function generate(next: Profile, ids: string[], extras: PlanExtras = {}): Promise<Plan> {
    if (generating.value) throw new Error('正在生成方案，请稍候。')

    const snapshot = clone(next)
    const selected = [...ids]
    if (selected.some(id => !jobs.value.some(job => job.id === id && canPlanJob(job, snapshot.role)))) {
      throw new Error('所选岗位不适用于当前规划方向，请重新选择岗位。')
    }
    const chosenJobs = clone(jobs.value.filter(job => selected.includes(job.id) && canPlanJob(job, snapshot.role)))
    const latestVersion = Math.max(0, ...plans.value.map(plan => plan.version))
    const version = latestVersion + 1
    const revision = workspaceRevision
    const previousDraft = JSON.stringify(profile.value)
    const previousSelection = JSON.stringify(selectedIds.value)

    // 自定义任务/被替换的模块跟着方案走，否则下次重新生成就丢了
    const customTasks = extras.customTasks ?? []
    const dropModules = extras.dropModules ?? []
    const hasExtras = customTasks.length > 0 || dropModules.length > 0

    generating.value = true
    try {
      const built = remotePlanEnabled()
        ? await requestPlan(snapshot, chosenJobs, version, { customTasks, dropModules })
        : createPlan(snapshot, chosenJobs, version)

      if (revision !== workspaceRevision) throw new Error('工作区已重置，已忽略这次生成结果。')

      const plan: Plan = hasExtras
        ? { ...built, customTasks: [...customTasks], dropModules: [...dropModules] }
        : built

      plans.value.unshift(plan)
      activeId.value = plan.id
      // 等待期间的草稿编辑保留下来，旧请求仅保存其自己的方案快照。
      if (JSON.stringify(profile.value) === previousDraft && JSON.stringify(selectedIds.value) === previousSelection) {
        profile.value = snapshot
        selectedIds.value = selected
      }
      hasDraft.value = true
      return plan
    } finally {
      generating.value = false
    }
  }

  function reset(): void {
    workspaceRevision += 1
    profile.value = clone(defaultProfile)
    jobs.value = clone(presetJobs)
    selectedIds.value = defaultJobIds('frontend')
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
    reset,
  }
})
