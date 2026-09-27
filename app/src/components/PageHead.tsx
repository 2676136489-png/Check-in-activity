import { isoDate } from '@/lib/date'
import type { GoalView } from '@/types'

interface Props {
  views: GoalView[]
}

/** 页头：日期 + 主标题 + 统计芯片 */
export function PageHead({ views }: Props) {
  const date = new Date()
  const dateStr = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const today = isoDate()

  const totalGoals = views.length
  const active = views.filter((g) => g.status !== 'done').length
  const done = views.filter((g) => g.status === 'done').length
  const atRisk = views.filter((g) => g.status === 'at-risk' || g.status === 'overdue').length

  return (
    <header className="px-5 pt-8 pb-5">
      <p className="text-xs text-muted tracking-wide">
        {dateStr} · 星期{weekDays[date.getDay()]}
      </p>
      <h1 className="serif text-3xl md:text-4xl font-bold text-ink mt-2 leading-tight">
        今天，把大目标往前推一点
      </h1>
      <p className="text-sm text-muted mt-2">
        数据离线保存在你的设备上，也可一键导出为 JSON 备份。
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        <span className="chip">共 {totalGoals} 个目标</span>
        <span className="chip">进行中 {active}</span>
        <span className="chip">已完成 {done}</span>
        {atRisk > 0 && <span className="chip text-[#a2382c]">需关注 {atRisk}</span>}
        <span className="chip">今日 {today}</span>
      </div>
    </header>
  )
}
