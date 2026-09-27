import { describe, expect, it } from 'vitest'
import { stackByGoal } from './chart'
import { offsetDays, recentDays } from './date'
import type { Log } from '@/types'

const TODAY = '2026-09-27'

const GOALS = [
  { id: 'g1', name: '背单词', color: '#2c6b5c' },
  { id: 'g2', name: '读书', color: '#9a6b2e' },
  { id: 'g3', name: '听课', color: '#a2382c' },
]

function mkLog(date: string, goalId: string, minutes?: number): Log {
  return {
    id: `${goalId}-${date}-${minutes}`,
    goalId,
    goalName: GOALS.find((g) => g.id === goalId)?.name ?? goalId,
    date,
    amount: 1,
    ...(minutes === undefined ? {} : { minutes }),
    createdAt: date,
  }
}

describe('stackByGoal —— 结构', () => {
  const bars = stackByGoal(GOALS, [], TODAY)

  it('固定输出 14 根柱子，从旧到新，最后一根是今天', () => {
    expect(bars).toHaveLength(14)
    expect(bars.map((b) => b.date)).toEqual(recentDays(14, TODAY))
    expect(bars[13].date).toBe(TODAY)
    expect(bars[0].date).toBe(offsetDays(-13, TODAY))
  })

  it('没有数据的天返回空分段、总量 0（而不是少一根柱子）', () => {
    for (const b of bars) {
      expect(b.segments).toEqual([])
      expect(b.total).toBe(0)
    }
  })
})

describe('stackByGoal —— 堆叠', () => {
  it('同一天多个目标按 goals 顺序依次向上叠，offset 连续', () => {
    const logs = [
      mkLog(TODAY, 'g1', 30),
      mkLog(TODAY, 'g2', 20),
      mkLog(TODAY, 'g3', 50),
    ]
    const bar = stackByGoal(GOALS, logs, TODAY)[13]

    expect(bar.segments.map((s) => [s.goalId, s.value, s.offset])).toEqual([
      ['g1', 30, 0],
      ['g2', 20, 30],
      ['g3', 50, 50],
    ])
    expect(bar.total).toBe(100)
  })

  it('总量等于各段之和（不是取最大值，也不是只算第一段）', () => {
    const logs = [mkLog(TODAY, 'g1', 7), mkLog(TODAY, 'g3', 11)]
    const bar = stackByGoal(GOALS, logs, TODAY)[13]
    expect(bar.total).toBe(bar.segments.reduce((s, x) => s + x.value, 0))
    expect(bar.total).toBe(18)
  })

  it('跳过的目标不占高度，后面的段 offset 不会凭空抬高', () => {
    // g1 没有数据 → 只应有 g2 / g3 两段，且 g3 的 offset 等于 g2 的值
    const logs = [mkLog(TODAY, 'g2', 20), mkLog(TODAY, 'g3', 5)]
    const bar = stackByGoal(GOALS, logs, TODAY)[13]
    expect(bar.segments).toHaveLength(2)
    expect(bar.segments[0]).toMatchObject({ goalId: 'g2', offset: 0 })
    expect(bar.segments[1]).toMatchObject({ goalId: 'g3', offset: 20 })
    expect(bar.total).toBe(25)
  })

  it('同一目标同一天的多条记录先求和再入段', () => {
    const logs = [mkLog(TODAY, 'g1', 10), mkLog(TODAY, 'g1', 15)]
    const bar = stackByGoal(GOALS, logs, TODAY)[13]
    expect(bar.segments).toHaveLength(1)
    expect(bar.segments[0].value).toBe(25)
  })

  it('没填分钟数的记录不参与图表，也不按 0 计入', () => {
    const logs = [mkLog(TODAY, 'g1', 12), mkLog(TODAY, 'g2')]
    const bar = stackByGoal(GOALS, logs, TODAY)[13]
    expect(bar.segments.map((s) => s.goalId)).toEqual(['g1'])
    expect(bar.total).toBe(12)
  })

  it('窗口外的记录被丢掉', () => {
    const logs = [mkLog(offsetDays(-14, TODAY), 'g1', 99), mkLog(offsetDays(1, TODAY), 'g1', 99)]
    const bars = stackByGoal(GOALS, logs, TODAY)
    expect(bars.every((b) => b.total === 0)).toBe(true)
  })

  it('分段带上目标名与颜色，方便图例与柱子共用同一份来源', () => {
    const bar = stackByGoal(GOALS, [mkLog(TODAY, 'g2', 3)], TODAY)[13]
    expect(bar.segments[0]).toMatchObject({ goalName: '读书', color: '#9a6b2e' })
  })

  it('没有目标时不会崩，只是全空', () => {
    const bars = stackByGoal([], [mkLog(TODAY, 'g1', 30)], TODAY)
    expect(bars).toHaveLength(14)
    expect(bars.every((b) => b.total === 0)).toBe(true)
  })

  it('自定义天数生效', () => {
    expect(stackByGoal(GOALS, [], TODAY, 7)).toHaveLength(7)
  })
})
