import { useEffect, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { createRepo } from '@/repo'
import type { Repository } from '@/repo/types'
import type { TabKey } from '@/types'
import { isoDate } from '@/lib/date'
import { PageHead } from '@/components/PageHead'
import { NavTabs } from '@/components/NavTabs'
import { TodayTable } from '@/components/TodayTable'
import { BoardView } from '@/components/BoardView'
import { WeekReview } from '@/components/WeekReview'
import { MineView } from '@/components/MineView'
import { AddGoal } from '@/components/AddGoal'

export default function App() {
  const [repo, setRepo] = useState<Repository | null>(null)
  useEffect(() => {
    createRepo().then(setRepo)
  }, [])

  const store = useStore(repo)
  if (!repo) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted">
        初始化中…
      </div>
    )
  }
  const [tab, setTab] = useState<TabKey>('today')
  const [addOpen, setAddOpen] = useState(false)
  const [checkInGoalId, setCheckInGoalId] = useState<string | null>(null)

  const handleCheckIn = async (goalId: string, amount: number, minutes?: number) => {
    const goal = store.goals.find((g) => g.id === goalId)
    if (!goal) return
    await store.addLog({
      goalId,
      goalName: goal.name,
      date: isoDate(),
      amount,
      minutes: minutes || undefined,
      backfilled: false,
    })
    setCheckInGoalId(null)
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHead views={store.goalViews} />
      <NavTabs active={tab} onChange={setTab} />

      <main className="max-w-3xl mx-auto pt-4 pb-8">
        {store.loading ? (
          <p className="text-center text-sm text-muted py-10">加载中…</p>
        ) : store.error ? (
          <p className="text-center text-sm text-[#a2382c] py-10">{store.error}</p>
        ) : (
          <>
            {tab === 'today' && (
              <TodayTable views={store.goalViews} logs={store.logs} onCheckIn={(id) => setCheckInGoalId(id)} />
            )}
            {tab === 'board' && (
              <BoardView views={store.goalViews} logs={store.logs} onCheckIn={(id) => setCheckInGoalId(id)} />
            )}
            {tab === 'week' && <WeekReview reviews={store.reviews} onSubmit={store.addReview} />}
            {tab === 'mine' && (
              <MineView onExport={store.exportAll} onImport={store.importAll} repoKind={repo.kind} />
            )}
          </>
        )}
      </main>

      {/* 浮动添加按钮 */}
      <button
        className="fixed bottom-20 md:bottom-6 right-5 z-20 w-12 h-12 rounded-full bg-ink text-white text-2xl shadow-card hover:bg-ink-600 transition-colors"
        onClick={() => setAddOpen(true)}
        aria-label="添加目标"
      >
        +
      </button>

      <AddGoal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={store.addGoal} />

      {/* 打卡弹层 */}
      {checkInGoalId && (
        <CheckInModal
          goalName={store.goals.find((g) => g.id === checkInGoalId)?.name ?? ''}
          onClose={() => setCheckInGoalId(null)}
          onSubmit={(amount, minutes) => handleCheckIn(checkInGoalId, amount, minutes)}
        />
      )}
    </div>
  )
}

function CheckInModal({
  goalName,
  onClose,
  onSubmit,
}: {
  goalName: string
  onClose: () => void
  onSubmit: (amount: number, minutes?: number) => void
}) {
  const [amount, setAmount] = useState(10)
  const [minutes, setMinutes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink-700/30" onClick={onClose}>
      <div
        className="bg-paper w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="serif text-lg font-bold mb-1">打卡 · {goalName}</h2>
        <p className="text-xs text-muted mb-4">今天完成了多少？</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">完成量</label>
            <input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">用时（分钟，可选）</label>
            <input
              type="number"
              className="input"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="用于图表统计"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="btn-ghost hairline flex-1" onClick={onClose}>取消</button>
          <button
            className="btn-primary flex-1"
            onClick={() => onSubmit(amount, minutes ? Number(minutes) : undefined)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
