import { describe, expect, it } from 'vitest'
import { analyzeJobs, createPlan, diffPlans } from './planning'
import type { Job, Profile } from './types'

const profile: Profile = {
  major: '计算机科学与技术', semester: 3, role: 'frontend', courses: '',
  skills: ['programming'], scores: { programming: 5, project: null, analysis: null, communication: null },
  hours: 12, path: 'job', interests: ['技术实现'],
}
const jobs: Job[] = [{ id: 'one', role: 'frontend', title: '前端开发', company: '示例', education: '本科',
  text: '掌握 JavaScript，熟悉 JS；掌握 TypeScript 和 Vue；熟悉 HTML/CSS 和 Git；具备项目经验与沟通能力。', source: 'demo', url: '', collectedAt: '' }]

describe('岗位分析的证据与统计', () => {
  it('同一岗位的 JS 与 JavaScript 只计一次，并保留原文证据', () => {
    const result = analyzeJobs(jobs)
    const skill = result.find(s => s.id === 'javascript')
    expect(skill?.count).toBe(1)
    expect(skill?.evidence[0]?.sentence).toContain('掌握 JavaScript')
  })
  it('没有选中的岗位时不生成虚构统计', () => expect(analyzeJobs([])).toEqual([]))
  it('同一句中的必备与加分要求按各自分句区分', () => {
    const result = analyzeJobs([{ ...jobs[0]!, text: '掌握 JavaScript，TypeScript 使用经验者优先。' }])
    expect(result.find(s => s.id === 'javascript')?.evidence[0]?.kind).toBe('明确要求')
    expect(result.find(s => s.id === 'typescript')?.evidence[0]?.kind).toBe('加分项')
  })
  it('只提及 Vue 的岗位仍保留学习 Vue 所需的前置基础', () => {
    const plan = createPlan(profile, [{ ...jobs[0]!, text: '掌握 Vue。' }], 1)
    expect(plan.tasks.some(t => t.id === 'javascript')).toBe(true)
    expect(plan.tasks.some(t => t.id === 'typescript')).toBe(true)
  })
})

describe('按约束排学期任务', () => {
  it('12 小时方案任意一周都不超预算，前置任务先完成', () => {
    const plan = createPlan(profile, jobs, 1)
    expect(plan.tasks.some(t => t.semester !== null)).toBe(true)
    for (let semester = 3; semester <= 8; semester++) {
      for (let week = 1; week <= 16; week++) {
        const load = plan.tasks.filter(t => t.semester === semester && t.startWeek !== null && week >= t.startWeek && week < t.startWeek + t.weeks).reduce((sum, t) => sum + t.hours, 0)
        expect(load).toBeLessThanOrEqual(12)
      }
    }
    for (const task of plan.tasks.filter(t => t.semester !== null)) {
      for (const id of task.prerequisites) {
        const previous = plan.tasks.find(t => t.id === id)
        if (!previous || previous.semester === null || task.startWeek === null || previous.startWeek === null) continue
        expect((previous.semester - 1) * 16 + previous.startWeek + previous.weeks).toBeLessThanOrEqual((task.semester! - 1) * 16 + task.startWeek)
      }
    }
  })
  it('预算从 12 降到 6 小时时会推迟任务，并且保留基础行动', () => {
    const before = createPlan(profile, jobs, 1)
    const after = createPlan({ ...profile, hours: 6 }, jobs, 2)
    const changes = diffPlans(before, after)
    expect(changes.some(c => c.status === '推迟')).toBe(true)
    expect(after.tasks.some(t => t.kind === '基础' && t.semester === 3)).toBe(true)
    for (let s = 3; s <= 8; s++) for (let w = 1; w <= 16; w++) {
      expect(after.tasks.filter(t => t.semester === s && t.startWeek !== null && w >= t.startWeek && w < t.startWeek + t.weeks).reduce((n, t) => n + t.hours, 0)).toBeLessThanOrEqual(6)
    }
  })
  it('0 小时时保留待安排行动，但不排入任何学期', () => {
    const plan = createPlan({ ...profile, hours: 0 }, jobs, 1)
    expect(plan.tasks.length).toBeGreaterThan(0)
    expect(plan.tasks.every(t => t.semester === null)).toBe(true)
  })
  it('很低预算和最后学期放不下的任务有待安排原因，不越过毕业', () => {
    const plan = createPlan({ ...profile, semester: 8, hours: 1 }, jobs, 1)
    expect(plan.tasks.some(t => t.semester === null && t.reason.length > 0)).toBe(true)
    expect(plan.tasks.every(t => t.semester === null || t.semester === 8)).toBe(true)
  })
  it('切换后端岗位会增加后端任务并移除前端专项任务', () => {
    const backJobs: Job[] = [{ ...jobs[0]!, id: 'back', role: 'backend', text: '掌握 Python、SQL 和 Git，具备 API 开发经验。' }]
    const changes = diffPlans(createPlan(profile, jobs, 1), createPlan({ ...profile, role: 'backend' }, backJobs, 2))
    expect(changes.some(c => c.status === '新增' && c.after?.skillIds.includes('python'))).toBe(true)
    expect(changes.some(c => c.status === '移除' && c.before?.skillIds.includes('vue'))).toBe(true)
  })
  it('画像编辑不会改写已经生成的方案快照', () => {
    const draft = structuredClone(profile)
    const plan = createPlan(draft, jobs, 1)
    draft.hours = 6
    draft.skills.push('vue')
    expect(plan.profile.hours).toBe(12)
    expect(plan.profile.skills).not.toContain('vue')
  })
  it('预算不变而改为考研优先时，推迟原因说明路径取舍', () => {
    const changes = diffPlans(createPlan(profile, jobs, 1), createPlan({ ...profile, path: 'graduate' }, jobs, 2))
    expect(changes.some(c => c.status === '推迟' && c.reason.includes('考研'))).toBe(true)
    expect(changes.some(c => c.reason.includes('12 调整为 12'))).toBe(false)
  })
  it('时间紧张时，兴趣影响可选任务的实际先后安排', () => {
    const technical = createPlan({ ...profile, hours: 6, interests: ['技术实现'] }, jobs, 1)
    const communication = createPlan({ ...profile, hours: 6, interests: ['沟通表达'] }, jobs, 2)
    const first = technical.tasks.find(t => t.id === 'portfolio')
    const second = communication.tasks.find(t => t.id === 'portfolio')
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second!.semester! * 16 + second!.startWeek!).toBeLessThan(first!.semester! * 16 + first!.startWeek!)
  })
})
