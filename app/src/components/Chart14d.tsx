import { recentDays } from '@/lib/date'
import type { GoalView, Log } from '@/types'

interface Props {
  views: GoalView[]
  logs: Log[]
}

/** 近 14 天学习时长柱状图（纯 SVG，无第三方图表库） */
export function Chart14d({ views, logs }: Props) {
  const days = recentDays(14)
  const width = 640
  const height = 160
  const pad = 24
  const barW = (width - pad * 2) / days.length - 4
  const maxVal = Math.max(
    1,
    ...days.map((d) =>
      logs.filter((l) => l.date === d).reduce((s, l) => s + (l.minutes ?? 0), 0),
    ),
  )

  const hasData = logs.some((l) => l.minutes)

  return (
    <div className="card">
      <h3 className="serif text-base font-semibold mb-3">近 14 天学习时长（分钟）</h3>
      {hasData ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
          {days.map((d, i) => {
            const val = logs
              .filter((l) => l.date === d)
              .reduce((s, l) => s + (l.minutes ?? 0), 0)
            const h = (val / maxVal) * (height - pad * 2)
            const x = pad + i * ((width - pad * 2) / days.length)
            const y = height - pad - h
            return (
              <g key={d}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={2}
                  fill="#2c6b5c"
                  opacity={0.8}
                />
                {i % 2 === 0 && (
                  <text x={x + barW / 2} y={height - 6} fontSize={9} fill="#6b6557" textAnchor="middle">
                    {d.slice(5)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      ) : (
        <p className="text-sm text-muted py-8 text-center">暂无分钟数据</p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {views.map((g) => (
          <span key={g.id} className="chip" style={{ borderColor: g.color + '40' }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
            {g.name}
          </span>
        ))}
      </div>
    </div>
  )
}
