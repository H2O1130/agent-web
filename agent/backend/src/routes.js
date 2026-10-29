// 8.4 四个端点的业务处理：校验入参 → （可选模拟）→ 调模型 → 校验出参
import { randomUUID } from 'node:crypto'
import { assertLlmConfigured, config } from './config.js'
import { LlmClient, LlmError } from './llm/client.js'
import { analyzePrompt, importPrompt, planPrompt, replanPrompt } from './llm/prompts.js'

const client = new LlmClient(config.llm)

function badRequest(message, code = 'bad_request') {
  const error = new Error(message)
  error.status = 400
  error.code = code
  throw error
}

function requireJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) badRequest('请先选择至少一条岗位样本。', 'no_jobs')
}

function mockPlan(profile, jobs, version) {
  return {
    id: randomUUID(),
    version,
    createdAt: new Date().toISOString(),
    profile,
    jobIds: jobs.map(job => job.id),
    tasks: [],
  }
}

/** POST /api/analyze → { skills } */
export async function handleAnalyze(body) {
  const { jobs } = body ?? {}
  requireJobs(jobs)

  if (config.mock) return { skills: [] }
  assertLlmConfigured()

  const data = await client.chatJson(analyzePrompt(jobs))
  if (!Array.isArray(data?.skills)) throw new LlmError('llm_bad_response', '模型未返回 skills 数组')
  return { skills: data.skills }
}

/** POST /api/plan → { plan }（version 由前端传入，后端原样写回） */
export async function handlePlan(body) {
  const { profile, jobs, version } = body ?? {}
  requireJobs(jobs)
  if (!profile || typeof profile !== 'object') badRequest('缺少学生画像 profile。', 'no_profile')
  if (!Number.isInteger(version)) badRequest('版本号 version 必须是整数。', 'bad_version')

  if (config.mock) return { plan: mockPlan(profile, jobs, version) }
  assertLlmConfigured()

  const data = await client.chatJson(planPrompt(profile, jobs, version))
  if (!data?.plan || typeof data.plan !== 'object') throw new LlmError('llm_bad_response', '模型未返回 plan 对象')
  return { plan: { ...data.plan, version } }
}

/** POST /api/plan/replan → { plan, changes } */
export async function handleReplan(body) {
  const { before, profile, jobs } = body ?? {}
  requireJobs(jobs)
  if (!before?.id) badRequest('缺少原方案 before。', 'no_before')
  if (!profile || typeof profile !== 'object') badRequest('缺少学生画像 profile。', 'no_profile')

  if (config.mock) {
    return { plan: mockPlan(profile, jobs, Number(before.version ?? 0) + 1), changes: [] }
  }
  assertLlmConfigured()

  const data = await client.chatJson(replanPrompt(before, profile, jobs))
  if (!data?.plan || typeof data.plan !== 'object') throw new LlmError('llm_bad_response', '模型未返回 plan 对象')
  if (!Array.isArray(data?.changes)) throw new LlmError('llm_bad_response', '模型未返回 changes 数组')
  return { plan: { ...data.plan, version: Number(before.version ?? 0) + 1 }, changes: data.changes }
}

/** POST /api/jobs/import → { job } */
export async function handleImport(body) {
  const { url = '', text, role } = body ?? {}
  if (typeof text !== 'string' || !text.trim()) badRequest('请粘贴招聘要求原文。', 'no_text')
  if (role !== 'frontend' && role !== 'backend') badRequest('目标岗位方向 role 无效。', 'bad_role')

  if (config.mock) {
    return {
      job: {
        id: `import-${randomUUID()}`,
        role,
        title: '导入的岗位',
        company: '用户导入',
        education: '见原文',
        text: text.trim(),
        source: 'imported',
        url: url.trim(),
        collectedAt: new Date().toISOString().slice(0, 10),
      },
    }
  }
  assertLlmConfigured()

  const data = await client.chatJson(importPrompt(url.trim(), text.trim(), role))
  if (!data?.job || typeof data.job !== 'object') throw new LlmError('llm_bad_response', '模型未返回 job 对象')
  return { job: { ...data.job, role, source: 'imported' } }
}
