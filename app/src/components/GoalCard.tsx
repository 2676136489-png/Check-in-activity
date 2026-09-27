import { humanDue } from '@/lib/date'
import { STATUS_COLOR } from '@/lib/palette'
import type { GoalView } from '@/types'
import { ProgressRing } from './ProgressRing'

interface Props {
  view: GoalView
  onCheckIn?: (id: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  'on-track': '正常推进',
  'at-risk': '可能延期',
  overdue: '已逾期',
  done: '已完成',
}

/** 看板上的目标卡片 */
export function GoalCard({ view, onCheckIn }: Props) {
  const statusColor = STATUS_COLOR[view.status]
  return (
    <div className="card flex items-start gap-4">
      <ProgressRing progress={view.progress} color={view.color} size={64} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="serif text-lg font-semibold truncate">{view.name}</h3>
          <span className="chip" style={{ color: statusColor, borderColor: statusColor + '40' }}>
            {STATUS_LABEL[view.status]}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">
          {view.done} / {view.total} {view.unit} · {humanDue(view.dueDays)}
        </p>
        {view.avg7 > 0 && (
          <p className="text-xs text-muted mt-0.5">
            近 7 天日均 {view.avg7.toFixed(1)} {view.unit}
            {view.etaDays !== null && ` · 预计 ${view.etaDays} 天完成`}
          </p>
        )}
        {view.obstacle && (
          <p className="text-xs mt-2 text-[#8c5a3a]">障碍：{view.obstacle}</p>
        )}
        {view.countermeasure && (
          <p className="text-xs text-ink-600">对策：{view.countermeasure}</p>
        )}
      </div>
      {onCheckIn && (
        <button className="btn-primary text-xs px-3 py-1.5" onClick={() => onCheckIn(view.id)}>
          打卡
        </button>
      )}
    </div>
  )
}
