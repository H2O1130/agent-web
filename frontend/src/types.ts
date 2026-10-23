export type Role = 'frontend' | 'backend'
export type CareerPath = 'job' | 'graduate' | 'undecided'
export type ScoreKey = 'programming' | 'project' | 'analysis' | 'communication'

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
  role: Role
  title: string
  company: string
  education: string
  text: string
  source: 'demo' | 'imported'
  url: string
  collectedAt: string
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

export interface PlannedTask {
  id: string
  title: string
  skillIds: string[]
  course: string
  outcome: string
  acceptance: string
  prerequisites: string[]
  hours: number
  weeks: number
  semester: number | null
  startWeek: number | null
  kind: '基础' | '专项' | '项目' | '可选' | '备考'
  jobIds: string[]
  reason: string
}

export interface Plan {
  id: string
  version: number
  createdAt: string
  profile: Profile
  jobIds: string[]
  tasks: PlannedTask[]
}

export interface TaskChange {
  id: string
  title: string
  status: '保留' | '推迟' | '新增' | '移除'
  before?: PlannedTask
  after?: PlannedTask
  reason: string
}
