/**
 * 示例数据的测试
 *
 * 示例数据是「第一次打开页面看到的东西」，它出问题的表现很隐蔽：
 * 日期算错会变成「最近 14 天一片空白」，引用断了会出现点不开的目标卡，
 * 而这些都是肉眼扫一眼容易放过去的。所以这里逐条钉死。
 */
import { describe, expect, it } from 'vitest'
import { buildSampleData, hasSampleData } from './sample'
import { buildGoalView } from './eta'
import { daysBetween, isoDate, mondayOf, offsetDays } from './date'

/** 固定锚点：2026-09-27 是周日（休息日），窗口内有效天为 6 天，边界最容易被写错 */
const TODAY = '2026-09-27'

describe('buildSampleData · 确定性', () => {
  it('同一个 today 调两次，结果完全一致（不含随机与当前时间）', () => {
    expect(buildSampleData(TODAY)).toEqual(buildSampleData(TODAY))
  })

  it('换一个 today，日期整体跟着平移，条数不变', () => {
    const a = buildSampleData(TODAY)
    const b = buildSampleData('2026-03-01')
    expect(b.goals.length).toBe(a.goals.length)
    expect(b.logs.length).toBe(a.logs.length)
    // 目标 id 与日志 id 都是算出来的，不随日期变
    expect(b.goals.map((g) => g.id)).toEqual(a.goals.map((g) => g.id))
    expect(b.logs.map((l) => l.id)).toEqual(a.logs.map((l) => l.id))
  })
})

describe('buildSampleData · 日期窗口', () => {
  const data = buildSampleData(TODAY)

  it('所有打卡日期都落在最近 14 天内', () => {
    for (const l of data.logs) {
      const age = daysBetween(l.date, TODAY)
      expect(age, `${l.date} 超出了 14 天窗口`).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(14)
    }
  })

  it('今天一定有可打卡的内容，否则「今日」页是空的', () => {
    expect(data.logs.some((l) => l.date === TODAY)).toBe(true)
  })

  it('14 天窗口的第一天 = today - 13，最后一天 = today', () => {
    const dates = [...new Set(data.logs.map((l) => l.date))].sort()
    expect(dates[0] >= offsetDays(-13, TODAY)).toBe(true)
    expect(dates[dates.length - 1] <= TODAY).toBe(true)
  })

  it('截止日按偏移生成：逾期目标确实在昨天之前，未逾期目标在之后', () => {
    const byName = Object.fromEntries(data.goals.map((g) => [g.name, g]))
    expect(daysBetween(TODAY, byName['读完《人类简史》'].due)).toBeLessThan(0)
    expect(daysBetween(TODAY, byName['背完考研核心词'].due)).toBeGreaterThan(0)
  })
})

describe('buildSampleData · 引用与数值完整性', () => {
  const data = buildSampleData(TODAY)

  it('每条打卡都能找到对应的目标（点开目标卡不会指到空处）', () => {
    const ids = new Set(data.goals.map((g) => g.id))
    for (const l of data.logs) {
      expect(ids.has(l.goalId), `日志 ${l.id} 的 goalId 悬空`).toBe(true)
    }
  })

  it('目标名与打卡里冗余存的 goalName 一致', () => {
    const nameById = Object.fromEntries(data.goals.map((g) => [g.id, g.name]))
    for (const l of data.logs) {
      expect(l.goalName).toBe(nameById[l.goalId])
    }
  })

  it('没有 NaN、负数、或超过总量的完成量', () => {
    for (const l of data.logs) {
      expect(Number.isFinite(l.amount)).toBe(true)
      expect(l.amount).toBeGreaterThan(0)
      if (l.minutes !== undefined) {
        expect(Number.isFinite(l.minutes)).toBe(true)
        expect(l.minutes).toBeGreaterThan(0)
      }
    }
    for (const g of data.goals) {
      const done = data.logs.filter((l) => l.goalId === g.id).reduce((s, l) => s + l.amount, 0)
      expect(done).toBeLessThanOrEqual(g.total)
    }
  })

  it('复盘落在 today 所属那一周', () => {
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0].weekStart).toBe(mondayOf(TODAY))
  })
})

describe('buildSampleData · 覆盖四种状态', () => {
  const data = buildSampleData(TODAY)
  const views = data.goals.map((g) => buildGoalView(g, data.logs, TODAY))
  const statuses = views.map((v) => v.status)

  it('四个目标分别落在 on-track / overdue / at-risk / done', () => {
    expect(statuses.sort()).toEqual(['at-risk', 'done', 'on-track', 'overdue'])
  })

  it('已逾期但已完成的目标仍然是 done，不该报红', () => {
    const finished = views.find((v) => v.status === 'done')
    expect(finished, '示例数据里应该有一个已完成的目标').toBeDefined()
    expect(finished!.dueDays).toBeLessThan(0) // 截止日确实已过
    expect(finished!.progress).toBe(1)
  })

  it('每个目标都有正的近 7 天均速，否则看板显示「还估不出来」', () => {
    for (const v of views) {
      expect(v.avg7, `${v.name} 的 avg7 为 0，示例数据看起来像空的`).toBeGreaterThan(0)
    }
  })
})

describe('hasSampleData', () => {
  it('含示例目标时为 true', () => {
    expect(hasSampleData(buildSampleData(TODAY).goals)).toBe(true)
  })

  it('用户自己建的目标不算示例', () => {
    const { goals } = buildSampleData(TODAY)
    const mine = { ...goals[0], id: 'mine', isSeed: false }
    expect(hasSampleData([mine])).toBe(false)
    expect(hasSampleData([])).toBe(false)
  })

  it('默认 today 取真实当天，且不影响确定性', () => {
    const a = buildSampleData()
    const b = buildSampleData(isoDate())
    expect(a).toEqual(b)
  })
})
