import { isoDate } from '@/lib/date'
import { stackByGoal } from '@/lib/chart'
import type { GoalView, Log } from '@/types'

interface Props {
  views: GoalView[]
  logs: Log[]
  /** 可注入的「今天」，便于确定性测试；默认取真实当天 */
  today?: string
}

const DAYS = 14
const W = 640
const H = 170
const PAD_X = 20
const PAD_TOP = 10
const PAD_BOTTOM = 26

/**
 * 近 14 天学习时长柱状图 —— 纯手写 SVG，不引图表库
 *
 * 每根柱子按目标分段堆叠，颜色与下方图例一一对应（两处都取自同一个
 * stackByGoal 结果，避免出现「图例四种颜色、柱子一种颜色」这种对不上的情况）。
 */
export function Chart14d({ views, logs, today = isoDate() }: Props) {
  const bars = stackByGoal(views, logs, today, DAYS)
  const slot = (W - PAD_X * 2) / DAYS
  const barW = slot - 4
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const maxVal = Math.max(1, ...bars.map((b) => b.total))
  const hasData = bars.some((b) => b.total > 0)

  return (
    <div className="card">
      <h3 className="serif text-base font-semibold mb-1">近 14 天学习时长</h3>
      <p className="text-xs text-muted mb-3">按目标堆叠 · 单位：分钟 · 只统计填了用时的记录</p>

      {hasData ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="近 14 天按目标堆叠的学习时长柱状图"
        >
          <line
            x1={PAD_X}
            y1={PAD_TOP + plotH}
            x2={W - PAD_X}
            y2={PAD_TOP + plotH}
            stroke="#e3dbc9"
            strokeWidth={1}
          />
          {bars.map((bar, i) => {
            const x = PAD_X + i * slot
            const isToday = i === bars.length - 1
            return (
              <g key={bar.date}>
                {bar.segments.map((s) => {
                  const h = (s.value / maxVal) * plotH
                  // 从柱底往上定位：底部 = 已堆叠高度（offset），顶部 = offset + 本段
                  const y = PAD_TOP + plotH - ((s.offset + s.value) / maxVal) * plotH
                  return (
                    <rect
                      key={s.goalId}
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(h, 1)}
                      rx={1.5}
                      fill={s.color}
                      opacity={0.92}
                    >
                      <title>{`${bar.date.slice(5)} ${s.goalName}：${s.value} 分钟`}</title>
                    </rect>
                  )
                })}
                {/* 隔一天标一次，避免挤；但今天那根一定要标出来 */}
                {(i % 2 === 0 || isToday) && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    fontSize={9}
                    fill={isToday ? '#1d5346' : '#b4ada0'}
                    textAnchor="middle"
                  >
                    {bar.date.slice(5)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      ) : (
        <p className="text-sm text-muted py-8 text-center">暂无用时数据</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {views.map((g) => (
          <span key={g.id} className="chip" style={{ borderColor: g.color + '40' }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
            <span className="whitespace-nowrap">{g.name}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
