/**
 * Supabase Repository —— 云端适配器（需安装 @supabase/supabase-js）
 *
 * 与 IndexedDBRepo 实现同一 Repository 接口，可在运行时切换。
 * 三张表：goals / logs / reviews（Supabase 表名建议同名）。
 *
 * 使用：
 *   import { createClient } from '@supabase/supabase-js'
 *   const client = createClient(url, anonKey)
 *   const repo = new SupabaseRepo(client)
 */
import type { Goal, Log, Review } from '@/types'
import type { Repository } from './types'

export interface SupabaseClientLike {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): Promise<{ data: unknown[] | null; error: unknown }>
      order(column: string, opts?: { ascending: boolean }): Promise<{ data: unknown[] | null; error: unknown }>
    }
    insert(row: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>
    }
    delete(): {
      eq(column: string, value: string): Promise<{ error: unknown }>
    }
  }
}

function rethrow(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error))
}

export class SupabaseRepo implements Repository {
  readonly kind = 'supabase' as const
  constructor(private client: SupabaseClientLike) {}

  // ---- Goals ----
  async listGoals(): Promise<Goal[]> {
    const { data, error } = await this.client.from('goals').select('*').order('order', { ascending: true })
    if (error) rethrow(error)
    return (data ?? []) as Goal[]
  }
  async addGoal(goal: Omit<Goal, 'id' | 'createdAt'>): Promise<Goal> {
    const row = { ...goal, created_at: new Date().toISOString() }
    const { data, error } = await this.client.from('goals').insert(row as Record<string, unknown>)
    if (error) rethrow(error)
    return (data as Goal[])[0] ?? ({ ...goal, id: '', createdAt: '' } as Goal)
  }
  async updateGoal(id: string, patch: Partial<Goal>): Promise<void> {
    const { error } = await this.client.from('goals').update(patch as Record<string, unknown>).eq('id', id)
    if (error) rethrow(error)
  }
  async deleteGoal(id: string): Promise<void> {
    const { error } = await this.client.from('goals').delete().eq('id', id)
    if (error) rethrow(error)
  }

  // ---- Logs ----
  async listLogs(): Promise<Log[]> {
    const { data, error } = await this.client.from('logs').select('*').order('date', { ascending: false })
    if (error) rethrow(error)
    return (data ?? []) as Log[]
  }
  async addLog(log: Omit<Log, 'id' | 'createdAt'>): Promise<Log> {
    const row = { ...log, created_at: new Date().toISOString() }
    const { data, error } = await this.client.from('logs').insert(row as Record<string, unknown>)
    if (error) rethrow(error)
    return (data as Log[])[0] ?? ({ ...log, id: '', createdAt: '' } as Log)
  }
  async updateLog(id: string, patch: Partial<Log>): Promise<void> {
    const { error } = await this.client.from('logs').update(patch as Record<string, unknown>).eq('id', id)
    if (error) rethrow(error)
  }
  async deleteLog(id: string): Promise<void> {
    const { error } = await this.client.from('logs').delete().eq('id', id)
    if (error) rethrow(error)
  }

  // ---- Reviews ----
  async listReviews(): Promise<Review[]> {
    const { data, error } = await this.client.from('reviews').select('*').order('week_start', { ascending: false })
    if (error) rethrow(error)
    return (data ?? []) as Review[]
  }
  async addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    const row = { ...review, created_at: new Date().toISOString() }
    const { data, error } = await this.client.from('reviews').insert(row as Record<string, unknown>)
    if (error) rethrow(error)
    return (data as Review[])[0] ?? ({ ...review, id: '', createdAt: '' } as Review)
  }
  async updateReview(id: string, patch: Partial<Review>): Promise<void> {
    const { error } = await this.client.from('reviews').update(patch as Record<string, unknown>).eq('id', id)
    if (error) rethrow(error)
  }
  async deleteReview(id: string): Promise<void> {
    const { error } = await this.client.from('reviews').delete().eq('id', id)
    if (error) rethrow(error)
  }

  async exportAll(): Promise<{ goals: Goal[]; logs: Log[]; reviews: Review[] }> {
    const [goals, logs, reviews] = await Promise.all([this.listGoals(), this.listLogs(), this.listReviews()])
    return { goals, logs, reviews }
  }

  async importAll(data: { goals: Goal[]; logs: Log[]; reviews: Review[] }): Promise<void> {
    // Supabase 无批量 upsert，逐条写入（生产环境可改用 bulk upsert）
    await Promise.all([
      ...data.goals.map((g) => this.addGoal(g)),
      ...data.logs.map((l) => this.addLog(l)),
      ...data.reviews.map((r) => this.addReview(r)),
    ])
  }
}
