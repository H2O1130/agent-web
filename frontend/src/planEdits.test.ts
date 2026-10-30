import { describe, expect, it } from 'vitest'
import { mergeCustomTasks, mergeDropModules, mergeEdits, moduleLabel } from './planEdits'
import type { CustomTask, Plan } from './types'

function task(title: string, id = ''): CustomTask {
  return { id: id || title, title, action: '做什么', done: '做到什么程度' }
}

describe('mergeCustomTasks', () => {
  it('追加新方向', () => {
    const result = mergeCustomTasks([task('Java 基础')], [task('Spring 入门')])

    expect(result.map(item => item.title)).toEqual(['Java 基础', 'Spring 入门'])
  })

  it('同一方向不重复添加（忽略大小写和空格）', () => {
    const result = mergeCustomTasks([task('Java 基础')], [task(' java 基础 ')])

    expect(result).toHaveLength(1)
  })

  it('保持原有顺序，新任务接在后面', () => {
    const result = mergeCustomTasks([task('A'), task('B')], [task('C'), task('A')])

    expect(result.map(item => item.title)).toEqual(['A', 'B', 'C'])
  })

  it('不超过 8 条', () => {
    const extra = Array.from({ length: 12 }, (_, index) => task(`方向 ${index}`))
    const result = mergeCustomTasks([], extra)

    expect(result).toHaveLength(8)
  })

  it('丢掉没有标题也没有 id 的任务', () => {
    const result = mergeCustomTasks([], [{ id: '', title: '', action: 'x', done: 'y' }])

    expect(result).toEqual([])
  })
})

describe('mergeDropModules', () => {
  it('去重并保留顺序', () => {
    expect(mergeDropModules(['python'], ['typescript', 'python'])).toEqual(['python', 'typescript'])
  })

  it('没有新增时保持原样', () => {
    expect(mergeDropModules(['python'], [])).toEqual(['python'])
  })
})

describe('mergeEdits', () => {
  it('方案上已有的编辑会带进下一次生成', () => {
    const plan = { customTasks: [task('Java 基础')], dropModules: ['python'] }

    const result = mergeEdits(plan, { customTasks: [task('Spring 入门')] })

    expect(result.customTasks.map(item => item.title)).toEqual(['Java 基础', 'Spring 入门'])
    expect(result.dropModules).toEqual(['python'])
  })

  it('老方案没有这些字段时也不报错', () => {
    expect(mergeEdits({}, {})).toEqual({ customTasks: [], dropModules: [] })
  })
})

describe('moduleLabel', () => {
  const plan = {
    tasks: [{ module: 'python', moduleName: 'Python 与数据处理' }],
  } as unknown as Plan

  it('用方案里的中文模块名', () => {
    expect(moduleLabel(plan, 'python')).toBe('Python 与数据处理')
  })

  it('找不到就退回 key', () => {
    expect(moduleLabel(plan, 'typescript')).toBe('typescript')
  })
})
