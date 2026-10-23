import jobData from './data/jobs.json'
import type { CareerPath, Job, Profile, Role, ScoreKey } from './types'

export const demoJobs = jobData as Job[]

export const roleNames: Record<Role, string> = {
  frontend: '前端开发',
  backend: 'Python 后端开发',
}

export const pathNames: Record<CareerPath, string> = {
  job: '就业优先',
  graduate: '考研优先',
  undecided: '暂未确定',
}

export const scoreLabels: Record<ScoreKey, string> = {
  programming: '编程能力',
  project: '项目实践',
  analysis: '分析能力',
  communication: '沟通能力',
}

export const defaultProfile: Profile = {
  major: '计算机科学与技术',
  semester: 3,
  role: 'frontend',
  courses: '',
  skills: [],
  scores: {
    programming: null,
    project: null,
    analysis: null,
    communication: null,
  },
  hours: 12,
  path: 'job',
  interests: [],
}

export interface SkillRule {
  id: string
  name: string
  pattern: RegExp
  course: string
  project: string
  outcome: string
}

/** 本地规则表：岗位原文命中 pattern 时，把要求关联到课程与实践成果。 */
export const skills: SkillRule[] = [
  {
    id: 'programming',
    name: '编程基础',
    pattern: /编程|程序设计/i,
    course: '程序设计基础',
    project: '命令行待办工具',
    outcome: '独立实现输入、条件分支与文件存储',
  },
  {
    id: 'html',
    name: 'HTML / CSS',
    pattern: /\bhtml\b|\bcss\b/i,
    course: 'Web 开发基础',
    project: '响应式校园介绍页',
    outcome: '在手机和桌面完成页面布局验证',
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    pattern: /javascript|\bjs\b/i,
    course: 'Web 程序设计',
    project: '校园活动报名应用',
    outcome: '完成表单、数据筛选与交互反馈',
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    pattern: /typescript|\bts\b/i,
    course: 'Web 程序设计（拓展）',
    project: '有类型的活动数据模块',
    outcome: '类型检查通过，核心数据有明确类型',
  },
  {
    id: 'vue',
    name: 'Vue',
    pattern: /\bvue\b/i,
    course: '前端框架实践（拓展）',
    project: 'Vue 校园活动工作台',
    outcome: '实现组件、路由和跨页状态',
  },
  {
    id: 'git',
    name: 'Git',
    pattern: /\bgit\b/i,
    course: '软件工程实践',
    project: '双人协作练习仓库',
    outcome: '完成分支协作、代码评审与一次冲突处理',
  },
  {
    id: 'python',
    name: 'Python',
    pattern: /\bpython\b/i,
    course: 'Python 程序设计',
    project: '课程数据处理工具',
    outcome: '完成输入校验、文件读写与异常处理',
  },
  {
    id: 'sql',
    name: 'SQL',
    pattern: /\bsql\b|数据库/i,
    course: '数据库原理',
    project: '课程管理数据模块',
    outcome: '设计表结构并完成关联查询',
  },
  {
    id: 'api',
    name: 'API / 接口',
    pattern: /\bapi\b|接口/i,
    course: '软件工程 / Web 开发',
    project: '校园服务接口联调',
    outcome: '记录接口输入、输出和异常情况',
  },
  {
    id: 'testing',
    name: '软件测试',
    pattern: /测试/i,
    course: '软件测试',
    project: '项目关键流程验证',
    outcome: '提交关键规则和用户流程的验证记录',
  },
  {
    id: 'communication',
    name: '沟通协作',
    pattern: /沟通|协作/i,
    course: '软件工程团队实践',
    project: '项目演示与复盘',
    outcome: '清楚解释方案选择、实践成果与反馈改进',
  },
]

interface TaskPeriodInput {
  semester: number | null
  startWeek: number | null
  weeks: number
}

export function taskPeriod(task: TaskPeriodInput): string {
  if (task.semester === null) return '待安排'

  const lastWeek = task.startWeek! + task.weeks - 1
  return `第 ${task.semester} 学期 · 第 ${task.startWeek}—${lastWeek} 周`
}
