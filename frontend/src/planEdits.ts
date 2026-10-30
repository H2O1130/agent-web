import type { CustomTask, Plan } from './types'

/** 后端一次最多接受 8 条自定义任务，这里保持同一个上限 */
const MAX_CUSTOM_TASKS = 8

interface PlanEdits {
  customTasks: CustomTask[]
  dropModules: string[]
}

function keyOf(task: CustomTask): string {
  return (task.title || task.id || '').trim().toLowerCase()
}

/**
 * 合并自定义任务：已经加过的保留（以先加的为准），新方向追加在后面。
 * 同一轮对话可能反复提同一个方向，按标题去重，避免方案里出现两条一样的任务。
 */
export function mergeCustomTasks(base: CustomTask[], extra: CustomTask[]): CustomTask[] {
  const merged = [...base]
  const seen = new Set(merged.map(keyOf).filter(Boolean))

  for (const task of extra) {
    const key = keyOf(task)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(task)
  }

  return merged.slice(0, MAX_CUSTOM_TASKS)
}

/** 被替换的模块只增不减：后续对话只谈别的事时，不该悄悄换回来 */
export function mergeDropModules(base: string[], extra: string[]): string[] {
  return [...new Set([...base, ...extra].filter(Boolean))]
}

export function mergeEdits(plan: Pick<Plan, 'customTasks' | 'dropModules'>, extra: Partial<PlanEdits>): PlanEdits {
  return {
    customTasks: mergeCustomTasks(plan.customTasks ?? [], extra.customTasks ?? []),
    dropModules: mergeDropModules(plan.dropModules ?? [], extra.dropModules ?? []),
  }
}

/** 模块 key 换成中文名：优先用当前方案里出现过的模块名，找不到就退回 key */
export function moduleLabel(plan: Pick<Plan, 'tasks'>, moduleId: string): string {
  return plan.tasks.find(task => task.module === moduleId)?.moduleName || moduleId
}
