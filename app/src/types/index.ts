/**
 * 领域类型定义
 * —— 与线上资料库三张表的字段一一对应，便于 Repository 层做序列化映射
 */

/** 学习目标 */
export interface Goal {
  id: string
  name: string
  unit: string
  total: number
  due: string // ISO 日期 YYYY-MM-DD
  color: string
  obstacle?: string
  countermeasure?: string
  isSeed?: boolean
  order: number
  createdAt: string
}

/** 单条打卡记录 */
export interface Log {
  id: string
  goalId: string
  goalName: string
  date: string // ISO 日期 YYYY-MM-DD
  amount: number
  minutes?: number
  backfilled?: boolean
  createdAt: string
}

/** 周复盘 */
export interface Review {
  id: string
  weekStart: string // 周一的 ISO 日期
  keep: string
  problem: string
  try: string
  nextWeekPlan: string
  createdAt: string
}

/** 聚合后的目标运行时视图（含进度 / ETA） */
export interface GoalView extends Goal {
  done: number
  rest: number
  progress: number // 0..1
  avg7: number // 近 7 天日均
  etaDays: number | null // 按近 7 天均速推算的剩余天数
  dueDays: number // 距截止日天数（负数=已逾期）
  status: 'on-track' | 'at-risk' | 'overdue' | 'done'
}

/** 活跃 Tab */
export type TabKey = 'today' | 'board' | 'week' | 'mine'
