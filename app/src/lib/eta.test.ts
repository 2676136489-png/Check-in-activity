import { describe, expect, it } from 'vitest'
import { buildGoalView, dailySeries, dueLabel, hasReviewThisWeek } from './eta'
import { mondayOf, offsetDays, recentDays } from './date'
import type { Goal, Log } from '@/types'

/**
 * 固定一个「今天」，让近 7 天窗口可预期。
 * 2026-09-27 是周日，因此窗口内恰好有 1 个休息日，有效天数为 6。
 */
const TODAY = '2026-09-27'
const VALID_DAYS = 6

const weekday = (d: string) => new Date(d + 'T00:00:00').getDay()

function mkGoal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    name: '背英语单词',
    unit: '个',
    total: 100,
    due: offsetDays(30, TODAY),
    color: '#2c6b5c',
    order: 1,
    createdAt: TODAY,
    ...patch,
  }
}

let seq = 0
function mkLog(date: string, amount: number, goalId = 'g1'): Log {
  return {
    id: `l${++seq}`,
    goalId,
    goalName: '背英语单词',
    date,
    amount,
    createdAt: date,
  }
}

/** 近 7 天里每个非休息日都打 amount */
function steadyLogs(amount: number): Log[] {
  return recentDays(7, TODAY)
    .filter((d) => weekday(d) !== 0)
    .map((d) => mkLog(d, amount))
}

describe('buildGoalView —— 近 7 天均速', () => {
  it('休息日（周日）不计入日均，但计入累计完成量', () => {
    const logs = recentDays(7, TODAY).map((d) => mkLog(d, 10)) // 7 天各 10，含周日
    const v = buildGoalView(mkGoal({ total: 100 }), logs, TODAY)

    // 累计 = 7 × 10；日均 = 60 / 6
    expect(v.done).toBe(70)
    expect(v.avg7).toBe(10)
    expect(v.rest).toBe(30)
    expect(v.etaDays).toBe(3) // ceil(30 / 10)
  })

  it('只有休息日打过卡时，日均仍是 0，ETA 判为「算不出来」而不是 0', () => {
    const sunday = recentDays(7, TODAY).find((d) => weekday(d) === 0)
    expect(sunday).toBeDefined()

    const v = buildGoalView(mkGoal({ total: 100 }), [mkLog(sunday as string, 50)], TODAY)

    expect(v.done).toBe(50)
    expect(v.avg7).toBe(0)
    expect(v.etaDays).toBeNull()
  })

  it('完全没有记录时，ETA 为 null 而不是 Infinity / 0', () => {
    const v = buildGoalView(mkGoal(), [], TODAY)
    expect(v.avg7).toBe(0)
    expect(v.etaDays).toBeNull()
    expect(v.progress).toBe(0)
  })

  it('只统计本目标的记录，不串目标', () => {
    const logs = [...steadyLogs(10), ...steadyLogs(999).map((l) => ({ ...l, goalId: 'other' }))]
    const v = buildGoalView(mkGoal({ total: 100 }), logs, TODAY)
    expect(v.done).toBe(VALID_DAYS * 10)
    expect(v.avg7).toBe(10)
  })
})

describe('buildGoalView —— 四态判定', () => {
  it('已完成：进度封顶为 1，剩余不为负', () => {
    const logs = steadyLogs(10) // 合计 60
    const v = buildGoalView(mkGoal({ total: 50 }), logs, TODAY)

    expect(v.done).toBe(60)
    expect(v.rest).toBe(0)
    expect(v.progress).toBe(1)
    expect(v.status).toBe('done')
  })

  it('可能延期：ETA 超过剩余天数 → at-risk', () => {
    const v = buildGoalView(mkGoal({ total: 1000, due: offsetDays(30, TODAY) }), steadyLogs(10), TODAY)

    expect(v.avg7).toBe(10)
    expect(v.etaDays).toBe(94) // ceil((1000 - 60) / 10)
    expect(v.dueDays).toBe(30)
    expect(v.status).toBe('at-risk')
  })

  it('正常推进：同样的均速，但截止日足够远 → on-track', () => {
    const v = buildGoalView(mkGoal({ total: 1000, due: offsetDays(200, TODAY) }), steadyLogs(10), TODAY)

    expect(v.etaDays).toBe(94)
    expect(v.dueDays).toBe(200)
    expect(v.status).toBe('on-track')
  })

  it('已逾期优先于可能延期：截止日已过且未完成 → overdue', () => {
    const v = buildGoalView(mkGoal({ total: 1000, due: offsetDays(-2, TODAY) }), steadyLogs(10), TODAY)

    expect(v.dueDays).toBe(-2)
    expect(v.status).toBe('overdue')
  })

  it('已逾期但已完成 → 仍是 done（完成优先）', () => {
    const v = buildGoalView(mkGoal({ total: 60, due: offsetDays(-2, TODAY) }), steadyLogs(10), TODAY)
    expect(v.status).toBe('done')
  })
})

describe('dailySeries —— 图表用的按天聚合', () => {
  it('同一天多条记录求和，没有记录的天补 0', () => {
    const days = recentDays(3, TODAY)
    const logs = [
      mkLog(days[0], 5),
      mkLog(days[0], 7),
      mkLog(days[1], 3),
      mkLog(days[2], 999, 'other'), // 别的目标，不该被算进来
    ]

    expect(dailySeries('g1', logs, days).map((x) => x.amount)).toEqual([12, 3, 0])
  })
})

describe('hasReviewThisWeek —— 按周一起始日去重', () => {
  it('同一周已存在复盘则返回 true', () => {
    const mon = mondayOf(TODAY)
    expect(mon).toBe('2026-09-21')

    expect(hasReviewThisWeek([{ weekStart: mon }], TODAY)).toBe(true)
    expect(hasReviewThisWeek([{ weekStart: offsetDays(-7, mon) }], TODAY)).toBe(false)
    expect(hasReviewThisWeek([], TODAY)).toBe(false)
  })
})

describe('dueLabel —— 已完成的目标不再报逾期', () => {
  it('已完成时统一显示「已达成」，哪怕截止日早就过了', () => {
    expect(dueLabel('done', -10)).toBe('已达成')
    expect(dueLabel('done', 0)).toBe('已达成')
    expect(dueLabel('done', 30)).toBe('已达成')
  })

  it('未完成时沿用「逾期 N 天 / N 天后截止 / 今天截止」', () => {
    expect(dueLabel('overdue', -3)).toBe('逾期 3 天')
    expect(dueLabel('at-risk', 10)).toBe('10 天后截止')
    expect(dueLabel('on-track', 0)).toBe('今天截止')
  })

  it('与真实视图串起来：已逾期但已完成的目标文案是「已达成」', () => {
    const goal = mkGoal({ total: 10, due: offsetDays(-10, TODAY) })
    const logs = [mkLog(TODAY, 10)]
    const v = buildGoalView(goal, logs, TODAY)
    expect(v.status).toBe('done')
    expect(v.dueDays).toBeLessThan(0)
    expect(dueLabel(v.status, v.dueDays)).toBe('已达成')
  })
})
