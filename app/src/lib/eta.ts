/**
 * ETA 与进度计算 —— 核心业务逻辑
 *
 * 规则：
 * 1. 近 7 天回溯：统计最近 7 天（含今天）的打卡量，求日均 avg7
 * 2. 每周休息日：默认周日不计入进度（可配置），计算有效天数时剔除
 * 3. ETA = 剩余量 / avg7（avg7 > 0 时），否则 null
 * 4. 状态判定：进度=1 → done；逾期 → overdue；ETA > 剩余可用天数 → at-risk；否则 on-track
 */

import { daysBetween, isoDate, mondayOf, recentDays } from './date'
import type { Goal, GoalView, Log } from '@/types'

const REST_DAY = 0 // 周日为休息日（0=周日）

/** 计算单个目标的运行时视图 */
export function buildGoalView(goal: Goal, logs: Log[], today: string = isoDate()): GoalView {
  const seven = recentDays(7)
  const goalLogs = logs.filter((l) => l.goalId === goal.id)

  // 近 7 天有效打卡量（剔除休息日）
  let recentAmount = 0
  let validDays = 0
  for (const day of seven) {
    const dow = new Date(day + 'T00:00:00').getDay()
    if (dow === REST_DAY) continue
    validDays++
    const dayLogs = goalLogs.filter((l) => l.date === day)
    recentAmount += dayLogs.reduce((s, l) => s + l.amount, 0)
  }
  const avg7 = validDays > 0 ? recentAmount / validDays : 0

  // 累计完成量 = 该目标所有打卡量之和
  const done = goalLogs.reduce((s, l) => s + l.amount, 0)
  const rest = Math.max(0, goal.total - done)
  const progress = goal.total > 0 ? Math.min(1, done / goal.total) : 0

  // ETA
  const etaDays = avg7 > 0 ? Math.ceil(rest / avg7) : null

  // 距截止日
  const dueDays = daysBetween(today, goal.due)

  // 状态判定
  let status: GoalView['status']
  if (progress >= 1) {
    status = 'done'
  } else if (dueDays < 0) {
    status = 'overdue'
  } else if (etaDays !== null && etaDays > dueDays) {
    status = 'at-risk'
  } else {
    status = 'on-track'
  }

  return { ...goal, done, rest, progress, avg7, etaDays, dueDays, status }
}

/** 今天日期所属周是否已存在复盘 */
export function hasReviewThisWeek(reviews: { weekStart: string }[], today: string = isoDate()): boolean {
  const mon = mondayOf(today)
  return reviews.some((r) => r.weekStart === mon)
}

/** 统计某目标在指定日期范围内的每日打卡量（用于图表） */
export function dailySeries(
  goalId: string,
  logs: Log[],
  days: string[],
): { date: string; amount: number }[] {
  return days.map((date) => ({
    date,
    amount: logs
      .filter((l) => l.goalId === goalId && l.date === date)
      .reduce((s, l) => s + l.amount, 0),
  }))
}
