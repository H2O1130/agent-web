import type { Evidence, SkillStat } from './types'

/** 词云设计画布尺寸（组件按此 viewBox 等比缩放）。 */
export const CLOUD_VIEW = { width: 720, height: 340 } as const

export type CloudKind = 'required' | 'bonus' | 'neutral'

export interface CloudWord {
  id: string
  text: string
  count: number
  kind: CloudKind
  size: number
  x: number
  y: number
  color: string
  /** 含内边距的占位宽高，供碰撞检测与测试使用。 */
  width: number
  height: number
}

export interface CloudOptions {
  width?: number
  height?: number
  minSize?: number
  maxSize?: number
  padding?: number
  /** 自定义文字测量函数，便于测试注入。默认使用 canvas，退化时按字符估算。 */
  measure?: (text: string, size: number) => number
}

const FONT_STACK = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'

const COLORS: Record<CloudKind, string[]> = {
  required: ['#6f5312', '#7d5d17', '#8b6a1f'],
  bonus: ['#2b6561', '#327470', '#3a837e'],
  neutral: ['#4c4c45', '#5c5c54'],
}

let canvasContext: CanvasRenderingContext2D | null | undefined

function defaultMeasure(text: string, size: number): number {
  if (canvasContext === undefined) {
    canvasContext =
      typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }

  if (canvasContext) {
    canvasContext.font = `600 ${size}px ${FONT_STACK}`
    const measured = canvasContext.measureText(text).width
    if (Number.isFinite(measured) && measured > 0) return measured
  }

  // 无 canvas（如测试环境）时按字符类型估算：中文约 1 em，其余约 0.6 em。
  let width = 0
  for (const char of text) {
    width += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? size : size * 0.6
  }
  return width
}

function kindOf(evidence: Evidence[]): CloudKind {
  if (evidence.some(item => item.kind === '明确要求')) return 'required'
  if (evidence.some(item => item.kind === '加分项')) return 'bonus'
  return 'neutral'
}

interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

function intersects(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

/**
 * 生成关键词词云的布局。
 * 规则：按提及样本数降序放置；字号与频次成正比；从中心沿阿基米德螺线外扩，
 * 以矩形碰撞检测保证互不重叠；颜色区分「明确要求 / 加分项 / 表述不明」。
 */
export function buildWordCloud(skills: SkillStat[], options: CloudOptions = {}): CloudWord[] {
  const width = options.width ?? CLOUD_VIEW.width
  const height = options.height ?? CLOUD_VIEW.height
  const minSize = options.minSize ?? 16
  const maxSize = options.maxSize ?? 48
  const padding = options.padding ?? 6
  const measure = options.measure ?? defaultMeasure

  const ordered = [...skills].sort((a, b) => b.count - a.count)
  if (!ordered.length) return []

  const counts = ordered.map(item => item.count)
  const maxCount = Math.max(...counts, 1)
  const minCount = Math.min(...counts)
  const spread = maxCount - minCount

  const boxes: Box[] = []
  const words: CloudWord[] = []

  ordered.forEach((skill, index) => {
    const rankRatio =
      spread === 0 ? 1 - index / Math.max(1, ordered.length - 1) : (skill.count - minCount) / spread
    const size = Math.round(minSize + Math.max(0, Math.min(1, rankRatio)) * (maxSize - minSize))
    const measured = Math.max(1, measure(skill.name, size))
    const boxWidth = measured + padding * 2
    const boxHeight = size * 1.2 + padding * 2
    const kind = kindOf(skill.evidence)
    const point = findSlot(boxWidth, boxHeight, boxes, width, height)

    words.push({
      id: skill.id,
      text: skill.name,
      count: skill.count,
      kind,
      size,
      x: point.x,
      y: point.y,
      color: COLORS[kind][index % COLORS[kind].length],
      width: boxWidth,
      height: boxHeight,
    })

    boxes.push({
      x1: point.x - boxWidth / 2,
      y1: point.y - boxHeight / 2,
      x2: point.x + boxWidth / 2,
      y2: point.y + boxHeight / 2,
    })
  })

  return words
}

function findSlot(
  width: number,
  height: number,
  boxes: Box[],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2
  const margin = 4

  for (let step = 0; step < 12000; step++) {
    const angle = step * 0.12
    const radius = 3 * Math.sqrt(step)
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius * 0.66
    const box: Box = {
      x1: x - width / 2,
      y1: y - height / 2,
      x2: x + width / 2,
      y2: y + height / 2,
    }

    if (box.x1 < margin || box.y1 < margin || box.x2 > canvasWidth - margin || box.y2 > canvasHeight - margin) {
      continue
    }
    if (boxes.some(item => intersects(item, box))) continue
    return { x, y }
  }

  // 极端情况下（词条过多/过长）退化为居中，调用方通常不会触发。
  return { x: centerX, y: centerY }
}
