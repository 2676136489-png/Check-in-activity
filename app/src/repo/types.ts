/**
 * Repository 接口 —— 数据访问层抽象
 *
 * 业务层只依赖此接口，不关心底层是 IndexedDB、Supabase 还是 WorkBuddy 资料库。
 * 切换适配器只需换一个实现，符合「依赖倒置」。
 */
import type { Goal, Log, Review } from '@/types'

export interface Repository {
  /** 唯一标识，用于日志与调试 */
  readonly kind: 'indexeddb' | 'supabase' | 'memory'

  // ---- Goals ----
  listGoals(): Promise<Goal[]>
  addGoal(goal: Omit<Goal, 'id' | 'createdAt'>): Promise<Goal>
  updateGoal(id: string, patch: Partial<Goal>): Promise<void>
  deleteGoal(id: string): Promise<void>

  // ---- Logs ----
  listLogs(): Promise<Log[]>
  addLog(log: Omit<Log, 'id' | 'createdAt'>): Promise<Log>
  updateLog(id: string, patch: Partial<Log>): Promise<void>
  deleteLog(id: string): Promise<void>

  // ---- Reviews ----
  listReviews(): Promise<Review[]>
  addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>
  updateReview(id: string, patch: Partial<Review>): Promise<void>
  deleteReview(id: string): Promise<void>

  /** 全量导出（JSON 备份） */
  exportAll(): Promise<{ goals: Goal[]; logs: Log[]; reviews: Review[] }>

  /** 全量导入（覆盖） */
  importAll(data: { goals: Goal[]; logs: Log[]; reviews: Review[] }): Promise<void>
}
