/**
 * 图表数据 —— 把打卡记录摊成「天 × 目标」的堆叠柱
 *
 * 为什么把它从组件里抽出来：图表的全部数学都在这里（分段、堆叠偏移、总量）。
 * 留在组件里的后果是既测不到，也容易在改样式的时候被顺手改错 ——
 * 曾经就出过一次：柱子统一用了单色，而下方图例按目标列了四种颜色，
 * 两边对不上，看图的人会以为「颜色 = 目标」，其实根本没按目标分。
 */
import { recentDays } from './date'
import type { Log } from '@/types'

export interface StackSegment {
  goalId: string
  goalName: string
  color: string
  value: number
  /** 该段在柱子里的起始高度（从柱底往上累加），用于堆叠定位 */
  offset: number
}

export interface StackBar {
  date: string
  /** 当天全部的分钟数（= 各段之和） */
  total: number
  segments: StackSegment[]
}

/**
 * 按目标堆叠。只统计填了分钟数的记录 ——
 * 没填分钟的打卡不参与图表，也不按 0 计入，否则「有没有填」这件事就被抹平了。
 */
export function stackByGoal(
  goals: { id: string; name: string; color: string }[],
  logs: Log[],
  today: string,
  days = 14,
): StackBar[] {
  return recentDays(days, today).map((date) => {
    let offset = 0
    const segments: StackSegment[] = []

    for (const g of goals) {
      const value = logs
        .filter((l) => l.goalId === g.id && l.date === date)
        .reduce((s, l) => s + (l.minutes ?? 0), 0)
      if (value <= 0) continue
      segments.push({ goalId: g.id, goalName: g.name, color: g.color, value, offset })
      offset += value
    }

    return { date, total: offset, segments }
  })
}
