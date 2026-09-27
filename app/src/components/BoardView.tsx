import type { GoalView } from '@/types'
import { GoalCard } from './GoalCard'
import { Chart14d } from './Chart14d'
import type { Log } from '@/types'

interface Props {
  views: GoalView[]
  logs: Log[]
  onCheckIn: (id: string) => void
  /** 可注入的「今天」，便于确定性测试 */
  today?: string
}

/** 看板页：目标卡片网格 + 14 天图表 */
export function BoardView({ views, logs, onCheckIn, today }: Props) {
  return (
    <section className="px-5 space-y-4">
      <h2 className="serif text-lg font-semibold">看板</h2>
      {views.length === 0 ? (
        <div className="card text-center text-sm text-muted py-10">
          暂无目标。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {views.map((v) => (
            <GoalCard key={v.id} view={v} onCheckIn={onCheckIn} />
          ))}
        </div>
      )}
      <Chart14d views={views} logs={logs} today={today} />
    </section>
  )
}
