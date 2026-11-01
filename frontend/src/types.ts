export type Role = string
export type JobRole = string
export type CareerPath = 'job' | 'graduate' | 'undecided'
export type ScoreKey = 'programming' | 'project' | 'analysis' | 'communication'
export type PeriodKind = 'semester' | 'summer' | 'winter'

export interface Profile {
  major: string
  semester: number
  role: Role
  courses: string
  skills: string[]
  scores: Record<ScoreKey, number | null>
  hours: number
  path: CareerPath
  interests: string[]
}

export interface Job {
  id: string
  role: JobRole
  title: string
  company: string
  education: string
  text: string
  source: 'demo' | 'imported' | 'collected'
  url: string
  collectedAt: string
  platform?: string
  city?: string
  salary?: string
  experience?: string
  recruitmentType?: string
  deadline?: string
  recruitmentStatus?: string
  responsibilities?: string
  dataNotes?: string[]
}

export interface Evidence {
  jobId: string
  sentence: string
  kind: '明确要求' | '加分项' | '表述不明'
}

export interface SkillStat {
  id: string
  name: string
  count: number
  evidence: Evidence[]
}

/** 后端课程映射的一行：技能 → 课程 → 项目，附来源。 */
export interface MappingRow {
  skillId: string
  skillName: string
  skillCount: number
  jobIds: string[]
  courseId: string
  course: string
  courseSemester: number | null
  projectId: string
  project: string
  outcome: string
  acceptance: string
  reason: string
  alreadyTaken: boolean
  courseSource: string
  projectSource: string
  sourceKind: string
}

export interface PlannedTask {
  id: string
  title: string
  skillIds: string[]
  course: string
  outcome: string
  acceptance: string
  example?: string
  prerequisites: string[]
  hours: number
  weeks: number
  semester: number | null
  startWeek: number | null
  weekNote?: string
  periodIndex?: number
  periodLabel?: string
  periodKind?: PeriodKind
  module?: string
  moduleName?: string
  kind: '基础' | '专项' | '项目' | '可选' | '备考'
  jobIds: string[]
  reason: string
}

export interface Milestone {
  semester: number
  label?: string
  title: string
  evidence: string
}

export interface PlanOverview {
  goal: string
  strategy: string
  principles: string[]
  stack: string[]
  milestones: Milestone[]
  decisionPoint: string
}

export interface SemesterPlan {
  semester: number
  title: string
  goal: string
  output: string
  decision: string
  itemIds: string[]
}

export interface VacationPlan {
  id: string
  kind: 'summer' | 'winter'
  afterSemester: number
  label: string
  title: string
  goal: string
  output: string
  decision: string
  itemIds: string[]
}

export interface Plan {
  id: string
  version: number
  createdAt: string
  profile: Profile
  jobIds: string[]
  overview?: PlanOverview
  semesters?: SemesterPlan[]
  vacations?: VacationPlan[]
  tasks: PlannedTask[]
  /** AI 在对话里补充的任务，重新生成时带上，否则会丢 */
  customTasks?: CustomTask[]
  /** 被替换掉的模块（例如把 python 换成 java），重新生成时保持替换 */
  dropModules?: string[]
}

/** AI 补充的任务：目录里没有的方向，让它在对话里现加一条 */
export interface CustomTask {
  id: string
  title: string
  action: string
  done: string
  weeks?: number
  kind?: PlannedTask['kind']
  moduleName?: string
  skills?: string[]
}

export interface TaskChange {
  id: string
  title: string
  status: '保留' | '推迟' | '新增' | '移除'
  before?: PlannedTask
  after?: PlannedTask
  reason: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PlanConstraints {
  addSkills: string[]
  removeSkills: string[]
  keepTaskTitles: string[]
}

export interface ChatProposal {
  summary: string
  profile: Profile
  addSkills?: string[]
  removeSkills?: string[]
  keepTaskTitles?: string[]
}

export interface ChatReply {
  reply: string
  proposal?: ChatProposal | null
}
