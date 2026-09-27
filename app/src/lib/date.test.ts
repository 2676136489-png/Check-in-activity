import { describe, expect, it } from 'vitest'
import { daysBetween, humanDue, isoDate, mondayOf, offsetDays, recentDays } from './date'

describe('isoDate', () => {
  it('按本地时区输出 YYYY-MM-DD，补零', () => {
    // 注意月份从 0 开始：8 = 九月
    expect(isoDate(new Date(2026, 8, 7))).toBe('2026-09-07')
    expect(isoDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('daysBetween', () => {
  it('返回 b - a 的天数，可正可负', () => {
    expect(daysBetween('2026-09-27', '2026-09-30')).toBe(3)
    expect(daysBetween('2026-09-30', '2026-09-27')).toBe(-3)
    expect(daysBetween('2026-09-27', '2026-09-27')).toBe(0)
  })

  it('跨月、跨年均按自然日计算', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('offsetDays', () => {
  it('能跨月和跨年进位', () => {
    expect(offsetDays(1, '2026-09-30')).toBe('2026-10-01')
    expect(offsetDays(-1, '2026-10-01')).toBe('2026-09-30')
    expect(offsetDays(1, '2026-12-31')).toBe('2027-01-01')
    expect(offsetDays(-1, '2027-01-01')).toBe('2026-12-31')
  })

  it('跨闰年 2 月正确', () => {
    expect(offsetDays(1, '2028-02-28')).toBe('2028-02-29')
    expect(offsetDays(1, '2028-02-29')).toBe('2028-03-01')
  })
})

describe('mondayOf', () => {
  it('周日归到本周一，而不是下周一', () => {
    expect(mondayOf('2026-09-27')).toBe('2026-09-21') // 周日
  })

  it('周一返回自身，周中返回本周一', () => {
    expect(mondayOf('2026-09-21')).toBe('2026-09-21') // 周一
    expect(mondayOf('2026-09-23')).toBe('2026-09-21') // 周三
    expect(mondayOf('2026-09-26')).toBe('2026-09-21') // 周六
  })
})

describe('recentDays', () => {
  it('含基准当天、从旧到新、长度为 n', () => {
    const days = recentDays(7, '2026-09-27')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-09-21')
    expect(days[6]).toBe('2026-09-27')
  })

  it('窗口跨月时依然连续', () => {
    expect(recentDays(3, '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })
})

describe('humanDue', () => {
  it('三种口径：今天 / 还剩 / 逾期', () => {
    expect(humanDue(0)).toBe('今天截止')
    expect(humanDue(1)).toBe('1 天后截止')
    expect(humanDue(12)).toBe('12 天后截止')
    expect(humanDue(-2)).toBe('逾期 2 天')
  })
})
