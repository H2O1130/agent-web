import { pathNames, skills, taskPeriod } from './data'
import type { Evidence, Job, Plan, PlannedTask, Profile, SkillStat, TaskChange } from './types'

/** 一个学期按 16 教学周计算，规划覆盖大一至大四共 8 个学期。 */
const WEEKS_PER_SEMESTER = 16
const SEMESTERS_IN_PLAN = 8
const MAX_WEEKLY_HOURS = 30

const SENTENCE_SEPARATOR = /[。；;\n]/
const CLAUSE_SEPARATOR = /[，,]/
const BONUS_CLAUSE = /优先|加分/
const REQUIRED_CLAUSE = /掌握|熟悉|熟练|具备|能够|要求/

const COMMUNICATION_INTERESTS = ['沟通表达', '组织协作']
const TECHNICAL_INTERESTS = ['技术实现', '创意设计', '动手实践']

type SkillRule = (typeof skills)[number]
type TaskTemplate = Omit<PlannedTask, 'semester' | 'startWeek' | 'jobIds' | 'reason'>

const commonTasks: TaskTemplate[] = [
  {
    id: 'foundation',
    title: '用一个小工具核对编程基础',
    skillIds: ['programming'],
    course: '程序设计基础',
    outcome: '可运行的命令行待办工具',
    acceptance: '能够独立解释输入处理、条件分支与文件存储',
    prerequisites: [],
    hours: 2,
    weeks: 2,
    kind: '基础',
  },
  {
    id: 'git',
    title: '建立 Git 协作习惯',
    skillIds: ['git'],
    course: '软件工程实践',
    outcome: '带清晰提交记录的协作仓库',
    acceptance: '完成分支合并、一次冲突处理和 README',
    prerequisites: [],
    hours: 2,
    weeks: 2,
    kind: '基础',
  },
]

const frontendTasks: TaskTemplate[] = [
  {
    id: 'html',
    title: '搭建响应式网页',
    skillIds: ['html'],
    course: 'Web 开发基础',
    outcome: '手机与桌面均可使用的校园介绍页',
    acceptance: '320px—1920px 无页面横向溢出',
    prerequisites: ['foundation'],
    hours: 3,
    weeks: 3,
    kind: '基础',
  },
  {
    id: 'javascript',
    title: '把 JavaScript 用到真实交互里',
    skillIds: ['javascript'],
    course: 'Web 程序设计',
    outcome: '支持校验、筛选与保存的报名表单',
    acceptance: '处理空输入、重复报名和数据恢复',
    prerequisites: ['html'],
    hours: 4,
    weeks: 4,
    kind: '专项',
  },
  {
    id: 'typescript',
    title: '用 TypeScript 理清数据',
    skillIds: ['typescript'],
    course: 'Web 程序设计（拓展）',
    outcome: '有明确类型的活动数据模块',
    acceptance: '通过类型检查并移除无用途的封装',
    prerequisites: ['javascript'],
    hours: 3,
    weeks: 3,
    kind: '专项',
  },
  {
    id: 'vue',
    title: '完成 Vue 组件与页面协作',
    skillIds: ['vue'],
    course: '前端框架实践（拓展）',
    outcome: '带导航、表单和共享状态的 Vue 应用',
    acceptance: '返回修改数据后，页面显示与状态一致',
    prerequisites: ['typescript'],
    hours: 4,
    weeks: 4,
    kind: '专项',
  },
  {
    id: 'frontend-project',
    title: '交付校园活动报名项目',
    skillIds: ['vue', 'api', 'javascript'],
    course: '软件工程课程设计',
    outcome: '可演示项目、源码与验证记录',
    acceptance: '完整走通报名流程并解释方案取舍',
    prerequisites: ['vue', 'git'],
    hours: 6,
    weeks: 6,
    kind: '项目',
  },
  {
    id: 'frontend-extension',
    title: '拓展一个可访问性小项目',
    skillIds: ['html', 'javascript', 'testing'],
    course: 'Web 开发实践（选做）',
    outcome: '键盘可操作的小型应用与测试记录',
    acceptance: '覆盖键盘操作、错误提示和手机布局',
    prerequisites: ['javascript'],
    hours: 4,
    weeks: 6,
    kind: '可选',
  },
]

const backendTasks: TaskTemplate[] = [
  {
    id: 'python',
    title: '用 Python 处理课程数据',
    skillIds: ['python'],
    course: 'Python 程序设计',
    outcome: '有输入校验的数据处理工具',
    acceptance: '处理缺失文件、空数据和非法输入',
    prerequisites: ['foundation'],
    hours: 4,
    weeks: 4,
    kind: '专项',
  },
  {
    id: 'sql',
    title: '为课程系统设计数据库',
    skillIds: ['sql'],
    course: '数据库原理',
    outcome: '表结构、示例数据与查询语句',
    acceptance: '能够解释主键与关联，完成多表查询',
    prerequisites: ['python'],
    hours: 3,
    weeks: 4,
    kind: '专项',
  },
  {
    id: 'api',
    title: '实现清晰可用的服务接口',
    skillIds: ['api', 'python'],
    course: 'Web 开发 / 软件工程',
    outcome: '具有输入校验的校园服务',
    acceptance: '演示正常请求、错误输入和数据查询',
    prerequisites: ['sql'],
    hours: 4,
    weeks: 4,
    kind: '专项',
  },
  {
    id: 'backend-project',
    title: '交付课程管理后端项目',
    skillIds: ['python', 'sql', 'api'],
    course: '软件工程课程设计',
    outcome: '可演示服务、数据说明与源码',
    acceptance: '完成一个完整业务并通过关键规则验证',
    prerequisites: ['api', 'git'],
    hours: 6,
    weeks: 6,
    kind: '项目',
  },
  {
    id: 'backend-extension',
    title: '为服务补充关键流程测试',
    skillIds: ['python', 'testing'],
    course: '软件测试（选做）',
    outcome: '关键业务的自动化验证与报告',
    acceptance: '覆盖空数据、异常输入和重复操作',
    prerequisites: ['python'],
    hours: 4,
    weeks: 6,
    kind: '可选',
  },
]

const graduateTasks: TaskTemplate[] = [
  {
    id: 'math',
    title: '整理数学基础与每周练习',
    skillIds: [],
    course: '数学备考（路径假设）',
    outcome: '错题与知识点记录',
    acceptance: '每周完成练习并复盘薄弱点',
    prerequisites: [],
    hours: 4,
    weeks: 12,
    kind: '备考',
  },
  {
    id: 'english',
    title: '建立英语阅读与复盘习惯',
    skillIds: [],
    course: '英语备考（路径假设）',
    outcome: '阅读与词汇复盘记录',
    acceptance: '记录练习过程与易错问题',
    prerequisites: [],
    hours: 2,
    weeks: 12,
    kind: '备考',
  },
]

interface ScheduleContext {
  profile: Profile
  analysis: SkillStat[]
  templates: TaskTemplate[]
  tasks: PlannedTask[]
  weekLoads: number[]
  presentationFirst: boolean
}

export function analyzeJobs(jobs: Job[]): SkillStat[] {
  const uniqueJobs = dedupeJobs(jobs)
  const result: SkillStat[] = []

  for (const skill of skills) {
    const evidence = collectEvidence(skill, uniqueJobs)
    if (!evidence.length) continue
    result.push({
      id: skill.id,
      name: skill.name,
      count: new Set(evidence.map(item => item.jobId)).size,
      evidence,
    })
  }

  // 出现频次高的能力排在前面，同频次时保留技能表的原始顺序。
  return result.sort((a, b) => b.count - a.count)
}

export function createPlan(profile: Profile, jobs: Job[], version: number): Plan {
  if (!jobs.length) throw new Error('请先选择至少一条岗位样本。')

  assertProfile(profile)

  const analysis = analyzeJobs(jobs)
  if (!analysis.length) throw new Error('暂未识别到支持的技能，请补充岗位文本或选择示例样本。')

  const snapshot: Profile = JSON.parse(JSON.stringify(profile))
  const selectedSkills = new Set(analysis.map(stat => stat.id))
  const available = collectAvailableTasks(profile)
  const required = collectTaskIds(available, selectedSkills)
  const presentationFirst = prefersPresentation(profile)
  const optional = available.filter(task => required.has(task.id) && task.kind === '可选')

  const compulsory = available.filter(task => required.has(task.id) && task.kind !== '可选')
  if (presentationFirst) optional.sort(portfolioFirst)
  const templates = [...compulsory, ...optional]
  if (profile.path === 'graduate') templates.unshift(...graduateTasks)

  const weekLoads = Array.from(
    { length: (SEMESTERS_IN_PLAN + 1 - profile.semester) * WEEKS_PER_SEMESTER },
    () => 0,
  )
  const context: ScheduleContext = {
    profile,
    analysis,
    templates,
    tasks: [],
    weekLoads,
    presentationFirst,
  }

  for (const template of templates) {
    context.tasks.push(scheduleTask(template, context))
  }

  return {
    id: crypto.randomUUID(),
    version,
    createdAt: new Date().toISOString(),
    profile: snapshot,
    jobIds: jobs.map(job => job.id),
    tasks: context.tasks,
  }
}

export function diffPlans(before: Plan, after: Plan): TaskChange[] {
  const taskIds = [...new Set([...before.tasks, ...after.tasks].map(task => task.id))]
  return taskIds.map(id => compareTask(id, before, after))
}

function dedupeJobs(jobs: Job[]): Job[] {
  const unique = new Map<string, Job>()
  for (const job of jobs) unique.set(job.id, job)
  return [...unique.values()]
}

function collectEvidence(skill: SkillRule, jobs: Job[]): Evidence[] {
  const evidence: Evidence[] = []

  for (const job of jobs) {
    const sentences = job.text
      .split(SENTENCE_SEPARATOR)
      .map(sentence => sentence.trim())
      .filter(Boolean)

    for (const sentence of sentences) {
      if (!skill.pattern.test(sentence)) continue
      let previousKind: Evidence['kind'] = '表述不明'

      for (const clause of sentence.split(CLAUSE_SEPARATOR)) {
        const kind = classifyClause(clause, previousKind)
        previousKind = kind
        if (!skill.pattern.test(clause)) continue
        evidence.push({ jobId: job.id, sentence, kind })
      }
    }
  }

  return evidence
}

/**
 * 分句本身可能省略主语，沿用上一分句的语气判断：
 * “熟悉 JavaScript，TypeScript 优先”里，后半句仍按前置语境理解。
 */
function classifyClause(clause: string, fallback: Evidence['kind']): Evidence['kind'] {
  if (BONUS_CLAUSE.test(clause)) return '加分项'
  if (REQUIRED_CLAUSE.test(clause)) return '明确要求'
  return fallback
}

function assertProfile(profile: Profile): void {
  const semesterValid =
    Number.isInteger(profile.semester) && profile.semester >= 1 && profile.semester <= SEMESTERS_IN_PLAN
  const hoursValid =
    Number.isFinite(profile.hours) && profile.hours >= 0 && profile.hours <= MAX_WEEKLY_HOURS

  if (!semesterValid || !hoursValid) {
    throw new Error('请检查学期和每周时间，时间应为 0—30 小时。')
  }
}

function collectAvailableTasks(profile: Profile): TaskTemplate[] {
  const basics = commonTasks.filter(
    task => task.id !== 'foundation' || !profile.skills.includes('programming'),
  )
  const roleTasks = profile.role === 'frontend' ? frontendTasks : backendTasks
  return [...basics, ...roleTasks, buildPortfolioTask(profile)]
}

function buildPortfolioTask(profile: Profile): TaskTemplate {
  const projectId = profile.role === 'frontend' ? 'frontend-project' : 'backend-project'
  return {
    id: 'portfolio',
    title: '整理作品并练习项目演示',
    skillIds: ['communication'],
    course: '软件工程团队实践（选做）',
    outcome: '项目说明、演示记录与实习准备材料',
    acceptance: '清楚说明解决的问题、个人贡献、验证过程与改进',
    prerequisites: [projectId],
    hours: 3,
    weeks: 4,
    kind: '可选',
  }
}

/** 先按技能命中挑出任务，再反向补齐它们依赖的前置任务。 */
function collectTaskIds(available: TaskTemplate[], selectedSkills: Set<string>): Set<string> {
  const needed = new Set<string>()

  for (const task of available) {
    const isBasic = task.kind === '基础'
    const matchesSkill = task.skillIds.some(id => selectedSkills.has(id))
    if (!isBasic && !matchesSkill) continue
    needed.add(task.id)
  }

  const reversed = [...available].reverse()
  for (const task of reversed) {
    if (!needed.has(task.id)) continue
    for (const dependency of task.prerequisites) {
      needed.add(dependency)
    }
  }

  return needed
}

function prefersPresentation(profile: Profile): boolean {
  const statements = profile.interests
  const wantsCommunication = statements.some(interest => COMMUNICATION_INTERESTS.includes(interest))
  const wantsTechnical = statements.some(interest => TECHNICAL_INTERESTS.includes(interest))
  return wantsCommunication && !wantsTechnical
}

function portfolioFirst(a: TaskTemplate, b: TaskTemplate): number {
  if (a.id === 'portfolio') return -1
  if (b.id === 'portfolio') return 1
  return 0
}

function scheduleTask(template: TaskTemplate, context: ScheduleContext): PlannedTask {
  const { analysis } = context
  const jobIds = collectJobIds(template, analysis)
  const task: PlannedTask = {
    ...template,
    prerequisites: template.prerequisites.filter(id => context.templates.some(item => item.id === id)),
    skillIds: [...template.skillIds],
    semester: null,
    startWeek: null,
    jobIds,
    reason: '',
  }

  const dependencies = task.prerequisites.map(id => context.tasks.find(item => item.id === id))
  const blockingReason = findBlockingReason(template, dependencies, context)
  if (blockingReason) {
    task.reason = blockingReason
    return task
  }

  const startSlot = findStartSlot(template, dependencies, context)
  if (startSlot === null) {
    task.reason = '剩余学期内无法同时满足任务时长、前置条件和时间预算，暂列为待安排。'
    return task
  }

  placeTask(task, template, startSlot, context)
  task.reason = buildReason(task, context)
  return task
}

function collectJobIds(template: TaskTemplate, analysis: SkillStat[]): string[] {
  const related = analysis.filter(stat => template.skillIds.includes(stat.id))
  const ids = related.flatMap(stat => stat.evidence.map(item => item.jobId))
  return [...new Set(ids)]
}

function findBlockingReason(
  template: TaskTemplate,
  dependencies: (PlannedTask | undefined)[],
  context: ScheduleContext,
): string {
  const { profile } = context

  if (profile.hours === 0) {
    return '当前每周预算为 0 小时，课外任务暂停；有时间后再安排。'
  }

  if (template.hours > profile.hours) {
    return `此任务至少需要每周 ${template.hours} 小时，超过当前 ${profile.hours} 小时预算，暂不排入。`
  }

  const dependencyPending = dependencies.some(task => !task || task.semester === null)
  if (dependencyPending) {
    return '前置任务尚未安排，完成基础或调整预算后再安排。'
  }

  return ''
}

function findStartSlot(
  template: TaskTemplate,
  dependencies: (PlannedTask | undefined)[],
  context: ScheduleContext,
): number | null {
  const { profile, weekLoads } = context
  const earliest = Math.max(0, ...dependencies.map(task => earliestSlot(task, profile)))
  const latest = weekLoads.length - template.weeks

  for (let start = earliest; start <= latest; start++) {
    const end = start + template.weeks - 1
    const crossesSemester = Math.floor(start / WEEKS_PER_SEMESTER) !== Math.floor(end / WEEKS_PER_SEMESTER)
    if (crossesSemester) continue

    const overloaded = weekLoads
      .slice(start, start + template.weeks)
      .some(load => load + template.hours > profile.hours)
    if (overloaded) continue

    return start
  }

  return null
}

function earliestSlot(task: PlannedTask | undefined, profile: Profile): number {
  if (!task || task.semester === null || task.startWeek === null) return 0

  const semesterOffset = (task.semester - profile.semester) * WEEKS_PER_SEMESTER
  return semesterOffset + task.startWeek - 1 + task.weeks
}

function placeTask(
  task: PlannedTask,
  template: TaskTemplate,
  start: number,
  context: ScheduleContext,
): void {
  const { profile, weekLoads } = context

  for (let week = start; week < start + template.weeks; week++) {
    weekLoads[week] += template.hours
  }

  task.semester = profile.semester + Math.floor(start / WEEKS_PER_SEMESTER)
  task.startWeek = (start % WEEKS_PER_SEMESTER) + 1
}

function buildReason(task: PlannedTask, context: ScheduleContext): string {
  const { profile, presentationFirst } = context
  let reason = '为后续实践提供基础，先用小任务核对能力。'

  if (task.kind === '备考') {
    reason = '根据你选择的考研优先路径安排，可按实际备考计划修改。'
  } else if (task.jobIds.length) {
    reason = `对应 ${task.jobIds.length} 条当前样本的能力要求；在前置任务与每周预算内安排。`
  }

  if (task.kind !== '可选' || !profile.interests.length) return reason

  const order = presentationFirst
    ? '优先安排成果表达，再安排技术拓展'
    : '优先安排技术实践，再整理成果表达'
  return `${reason}结合你的“${profile.interests.join('、')}”兴趣，${order}；均放在基础和必需任务之后。`
}

function compareTask(id: string, before: Plan, after: Plan): TaskChange {
  const oldTask = before.tasks.find(task => task.id === id)
  const newTask = after.tasks.find(task => task.id === id)

  if (!oldTask) {
    return buildChange(id, oldTask, newTask, '新增', '根据新的岗位样本、能力要求或发展路径增加。')
  }

  if (!newTask) {
    return buildChange(id, oldTask, newTask, '移除', '新目标或所选样本已不需要这项专项任务。')
  }

  if (newTask.semester === null) {
    const status = oldTask.semester !== null ? '推迟' : '保留'
    return buildChange(id, oldTask, newTask, status, newTask.reason)
  }

  if (oldTask.semester !== null && isDelayed(oldTask, newTask)) {
    return buildChange(id, oldTask, newTask, '推迟', describeDelay(before, after, oldTask, newTask))
  }

  if (taskPeriod(oldTask) !== taskPeriod(newTask)) {
    return buildChange(id, oldTask, newTask, '保留', `现可安排在${taskPeriod(newTask)}。`)
  }

  return buildChange(id, oldTask, newTask, '保留', '当前条件下仍然适用，继续执行。')
}

function buildChange(
  id: string,
  before: PlannedTask | undefined,
  after: PlannedTask | undefined,
  status: TaskChange['status'],
  reason: string,
): TaskChange {
  const task = after ?? before
  if (!task) throw new Error(`任务 ${id} 缺失，无法比较方案差异。`)
  return { id, title: task.title, status, before, after, reason }
}

function isDelayed(before: PlannedTask, after: PlannedTask): boolean {
  if (before.periodIndex != null && after.periodIndex != null) {
    return after.periodIndex > before.periodIndex
  }
  if (before.semester !== after.semester) return (after.semester ?? 0) > (before.semester ?? 0)
  if (before.startWeek === null || after.startWeek === null) return false
  return after.startWeek > before.startWeek
}

function describeDelay(before: Plan, after: Plan, oldTask: PlannedTask, newTask: PlannedTask): string {
  const causes: string[] = []

  if (before.profile.hours !== after.profile.hours) {
    causes.push(`每周预算由 ${before.profile.hours} 调整为 ${after.profile.hours} 小时`)
  }
  if (before.profile.path !== after.profile.path) {
    causes.push(`路径从${pathNames[before.profile.path]}改为${pathNames[after.profile.path]}，重新分配学习时间`)
  }
  if (before.profile.role !== after.profile.role) {
    causes.push('岗位样本变化，重新安排专项与前置任务')
  }
  if (before.profile.interests.join() !== after.profile.interests.join()) {
    causes.push('兴趣变化，重新排序可选任务')
  }

  const summary = causes.join('；') || '根据所选岗位样本和前置关系重新安排'
  return `${summary}。从${taskPeriod(oldTask)}移至${taskPeriod(newTask)}。`
}
