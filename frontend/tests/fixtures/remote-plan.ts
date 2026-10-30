import type { Job, Plan, PlannedTask, Profile } from '../../src/types'

const defaultProfile: Profile = {
  major: '计算机科学与技术', semester: 3, role: 'frontend', courses: '', skills: [],
  scores: { programming: null, project: null, analysis: null, communication: null },
  hours: 12, path: 'job', interests: [],
}

/** 接口契约夹具；不表示真实模型产出。 */
export function remotePlan(
  profile: Profile = structuredClone(defaultProfile),
  jobs: Job[] = [],
  version = 1,
): Plan {
  const jobIds = [...new Set(jobs.map(job => job.id))]
  const suspended = profile.hours === 0
  const task: PlannedTask = {
    id: 'git-repo', title: '建立项目仓库', skillIds: ['git'], course: '软件工程实践',
    outcome: '一个有清晰提交记录的仓库', acceptance: '完成一次提交与分支合并',
    example: '为校园应用建立代码仓库', prerequisites: [], hours: 2, weeks: 1,
    semester: suspended ? null : profile.semester, startWeek: null,
    weekNote: suspended ? '' : '第 1 周', periodIndex: suspended ? -1 : 0,
    periodLabel: suspended ? '待安排' : `第 ${profile.semester} 学期`,
    periodKind: 'semester', module: 'git', moduleName: '协作基础', kind: '基础',
    jobIds, reason: suspended ? '当前每周没有可投入时间，暂不排期。' : '先准备协作基础。',
  }
  const vacationKind = profile.semester % 2 ? 'winter' : 'summer'
  const vacationLabel = vacationKind === 'winter' ? '寒假实践' : '暑假实践'
  const later: PlannedTask = {
    ...task, id: 'project-build', title: '完成校园应用原型', skillIds: ['programming'],
    prerequisites: ['git-repo'], kind: '项目', module: 'project', moduleName: '项目实践',
    outcome: '可演示的应用原型', acceptance: '完成核心流程并记录测试结果',
    periodIndex: suspended ? -1 : 1, periodLabel: suspended ? '待安排' : vacationLabel,
    periodKind: vacationKind, reason: suspended ? task.reason : '在假期集中完成一个小项目。',
  }
  return {
    id: `remote-plan-${version}`, version, createdAt: '2026-10-30T00:00:00Z',
    profile: structuredClone(profile), jobIds,
    overview: {
      goal: '把岗位要求转化为学习行动', strategy: '学期打基础，假期做项目。',
      principles: ['先完成基础再做项目'], stack: ['Git', '程序设计'],
      milestones: [{ semester: profile.semester, label: '基础阶段', title: '完成仓库', evidence: '提交记录' }],
      decisionPoint: '根据成果调整后续投入。',
    },
    semesters: suspended ? [] : [{ semester: profile.semester, title: '基础阶段', goal: '准备协作基础', output: task.outcome, decision: '', itemIds: [task.id] }],
    vacations: suspended ? [] : [{ id: 'vacation-1', kind: vacationKind, afterSemester: profile.semester, label: vacationLabel, title: vacationLabel, goal: '完成原型', output: later.outcome, decision: '', itemIds: [later.id] }],
    tasks: [task, later],
  }
}
