/**
 * 全局状态 Hook —— 拉取 + 增删改查 + 派生视图
 *
 * 把 Repository 的异步操作封装成 React 友好的状态，
 * 组件层只管渲染，不直接碰数据访问。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Goal, Log, Review } from '@/types'
import type { Repository } from '@/repo/types'
import { buildGoalView } from '@/lib/eta'
import { isoDate } from '@/lib/date'

export interface StoreState {
  goals: Goal[]
  logs: Log[]
  reviews: Review[]
  loading: boolean
  error: string | null
}

export function useStore(repo: Repository | null) {
  const [state, setState] = useState<StoreState>({
    goals: [],
    logs: [],
    reviews: [],
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    if (!repo) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [goals, logs, reviews] = await Promise.all([
        repo.listGoals(),
        repo.listLogs(),
        repo.listReviews(),
      ])
      setState({ goals, logs, reviews, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
    }
  }, [repo])

  useEffect(() => {
    if (repo) refresh()
  }, [repo, refresh])

  // ---- 目标 ----
  const addGoal = useCallback(
    async (g: Omit<Goal, 'id' | 'createdAt'>) => {
      if (!repo) return
      await repo.addGoal(g)
      await refresh()
    },
    [repo, refresh],
  )
  const deleteGoal = useCallback(
    async (id: string) => {
      if (!repo) return
      await repo.deleteGoal(id)
      await refresh()
    },
    [repo, refresh],
  )

  // ---- 打卡 ----
  const addLog = useCallback(
    async (l: Omit<Log, 'id' | 'createdAt'>) => {
      if (!repo) return
      await repo.addLog(l)
      await refresh()
    },
    [repo, refresh],
  )
  const deleteLog = useCallback(
    async (id: string) => {
      if (!repo) return
      await repo.deleteLog(id)
      await refresh()
    },
    [repo, refresh],
  )

  // ---- 复盘 ----
  const addReview = useCallback(
    async (r: Omit<Review, 'id' | 'createdAt'>) => {
      if (!repo) return
      await repo.addReview(r)
      await refresh()
    },
    [repo, refresh],
  )

  // ---- 备份还原 ----
  const exportAll = useCallback(() => {
    if (!repo) return Promise.resolve({ goals: [], logs: [], reviews: [] })
    return repo.exportAll()
  }, [repo])
  const importAll = useCallback(
    async (data: { goals: Goal[]; logs: Log[]; reviews: Review[] }) => {
      if (!repo) return
      await repo.importAll(data)
      await refresh()
    },
    [repo, refresh],
  )

  // 派生：目标运行时视图（含 ETA / 状态）
  const goalViews = useMemo(() => {
    const today = isoDate()
    return state.goals
      .map((g) => buildGoalView(g, state.logs, today))
      .sort((a, b) => a.order - b.order)
  }, [state.goals, state.logs])

  return {
    ...state,
    goalViews,
    addGoal,
    deleteGoal,
    addLog,
    deleteLog,
    addReview,
    exportAll,
    importAll,
    refresh,
  }
}
