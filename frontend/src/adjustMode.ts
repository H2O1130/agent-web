export type AdjustMode = 'manual' | 'ai'

export const DEFAULT_ADJUST_MODE: AdjustMode = 'ai'

interface ModePickerOptions {
  /** 两次点击间隔小于这个值算同一波连击 */
  burstWindow?: number
  /** 回到默认后短暂锁住点击的时间 */
  cooldown?: number
}

/**
 * 调整方式的点击判定：单点切换；同一波连击（双击/连点）回到默认。
 * 返回一个新状态，调用方保存即可。
 */
export function createModePicker(options: ModePickerOptions = {}) {
  const burstWindow = options.burstWindow ?? 700
  const cooldown = options.cooldown ?? 450

  let burstStart = 0
  let burstCount = 0
  let cooldownUntil = 0

  return function pick(current: AdjustMode, target: AdjustMode, now: number): AdjustMode {
    if (now < cooldownUntil) return current

    if (now - burstStart > burstWindow) {
      burstStart = now
      burstCount = 0
    }
    burstCount += 1

    if (burstCount >= 2) {
      burstStart = 0
      burstCount = 0
      cooldownUntil = now + cooldown
      return DEFAULT_ADJUST_MODE
    }

    return target
  }
}
