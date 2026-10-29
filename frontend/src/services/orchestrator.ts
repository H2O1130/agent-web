// 7 阶段串联编排层（M1/M3 · 成员1 赖叶盛）
// 职责：把「画像 → 岗位样本 → 能力分析 → 方案生成 → 路线呈现 → 方案调整 → 历史留存」
// 串成一条链路，并在需要调用大模型的 4 个阶段统一切换「本地规则」与「后端接口」。
// 开关：VITE_USE_MODEL=true 时走 /api/*（agent/backend）；默认 false 走本地规划，保证无后端也能跑。
// 失败策略：模型调用失败直接抛错（马凯确认，不做本地降级）。

import { analyzeJobs, createPlan, diffPlans } from '../planning'
import type { Job, Plan, Profile, Role, SkillStat, TaskChange } from '../types'
import { analyzeJobsApi, createPlanApi, importJobApi, replanApi } from './modelApi'

/** 是否启用大模型接口。默认关闭，使用本地规则。 */
export const MODEL_ENABLED = import.meta.env.VITE_USE_MODEL === 'true'

/** 7 个阶段及其归属（可直接用于文档/调试面板）。 */
export const PHASES = [
  { key: 'profile', name: '画像采集', local: 'Wizard.vue · store.profile' },
  { key: 'samples', name: '岗位样本', local: 'JobsPicker · store.jobs / selectedIds' },
  { key: 'analyze', name: '能力分析', local: 'planning.analyzeJobs', api: 'POST /api/analyze' },
  { key: 'plan', name: '方案生成', local: 'planning.createPlan', api: 'POST /api/plan' },
  { key: 'roadmap', name: '路线呈现', local: 'Roadmap.vue · store.activePlan' },
  { key: 'adjust', name: '方案调整', local: 'planning.createPlan + diffPlans', api: 'POST /api/plan/replan' },
  { key: 'history', name: '历史留存', local: 'store.plans · localStorage' },
] as const

/** 阶段 3：能力分析。模型模式返回后端统计；否则用本地规则。 */
export async function analyzePhase(jobs: Job[]): Promise<SkillStat[]> {
  if (MODEL_ENABLED) return (await analyzeJobsApi(jobs)).skills
  return analyzeJobs(jobs)
}

/** 阶段 4：方案生成。版本号由前端自增后传入（Q3）。 */
export async function planPhase(profile: Profile, jobs: Job[], version: number): Promise<Plan> {
  if (MODEL_ENABLED) return (await createPlanApi(profile, jobs, version)).plan
  return createPlan(profile, jobs, version)
}

/** 阶段 6：方案调整。模型模式返回后端计算的变更；本地模式用 diffPlans 得到同样的结构。 */
export async function replanPhase(
  before: Plan,
  profile: Profile,
  jobs: Job[],
): Promise<{ plan: Plan; changes: TaskChange[] }> {
  if (MODEL_ENABLED) return replanApi(before, profile, jobs)
  const plan = createPlan(profile, jobs, before.version + 1)
  return { plan, changes: diffPlans(before, plan) }
}

/** 阶段 2 的导入动作：解析岗位原文为结构化岗位。 */
export async function importPhase(url: string, text: string, role: Role): Promise<Job> {
  if (MODEL_ENABLED) return (await importJobApi(url, text, role)).job
  throw new Error('本地模式暂不支持自动解析岗位，请手动填写岗位信息。')
}
