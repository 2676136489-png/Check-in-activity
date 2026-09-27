import { humanDue } from '@/lib/date'
import { STATUS_COLOR } from '@/lib/palette'
import type { GoalView, Log } from '@/types'
import { isoDate } from '@/lib/date'

interface Props {
  views: GoalView[]
  logs: Log[]
  onCheckIn: (goalId: string) => void
}

/** 今日打卡表 */
export function TodayTable({ views, logs, onCheckIn }: Props) {
  const today = isoDate()
  const todayLogs = logs.filter((l) => l.date === today)

  return (
    <section className="px-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="serif text-lg font-semibold">今日打卡</h2>
        <span className="text-xs text-muted">今天 {today}</span>
      </div>

      {views.length === 0 ? (
        <div className="card text-center text-sm text-muted py-10">
          还没有目标。点击右下角「+」添加第一个目标。
        </div>
      ) : (
        <div className="card divide-y divide-hairline overflow-hidden">
          {views.map((g) => {
            const doneToday = todayLogs
              .filter((l) => l.goalId === g.id)
              .reduce((s, l) => s + l.amount, 0)
            const pct = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0
            return (
              <div key={g.id} className="flex items-center gap-3 py-3 px-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: g.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{g.name}</span>
                    <span className="text-xs text-muted">
                      {doneToday}/{g.unit} · 累计 {g.done}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-ink-50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: g.color }}
                      />
                    </div>
                    <span className="text-xs text-muted w-10 text-right">{pct}%</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: STATUS_COLOR[g.status] }}>
                    {humanDue(g.dueDays)}
                  </p>
                </div>
                <button
                  className="btn-primary text-xs px-3 py-1.5 shrink-0"
                  onClick={() => onCheckIn(g.id)}
                >
                  打卡
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
