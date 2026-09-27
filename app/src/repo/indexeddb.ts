/**
 * IndexedDB Repository —— 本地持久化适配器
 *
 * 使用原生 IndexedDB（无第三方依赖），三个对象仓库对应三张表。
 * 所有操作返回 Promise，与 Repository 接口对齐。
 */
import type { Goal, Log, Review } from '@/types'
import type { Repository } from './types'

const DB_NAME = 'learning-goal-console'
const DB_VERSION = 1
const STORES = {
  goals: 'goals',
  logs: 'logs',
  reviews: 'reviews',
} as const

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export class IndexedDBRepo implements Repository {
  readonly kind = 'indexeddb' as const
  private db: IDBDatabase | null = null

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORES.goals)) db.createObjectStore(STORES.goals, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORES.logs)) db.createObjectStore(STORES.logs, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORES.reviews)) db.createObjectStore(STORES.reviews, { keyPath: 'id' })
      }
      req.onsuccess = () => {
        this.db = req.result
        resolve(this.db)
      }
      req.onerror = () => reject(req.error)
    })
  }

  private tx<T>(store: string, mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode)
          const req = fn(t.objectStore(store))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }),
    )
  }

  private getAll<T>(store: string): Promise<T[]> {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, 'readonly')
          const req = t.objectStore(store).getAll()
          req.onsuccess = () => resolve(req.result as T[])
          req.onerror = () => reject(req.error)
        }),
    )
  }

  // ---- Goals ----
  listGoals(): Promise<Goal[]> {
    return this.getAll<Goal>(STORES.goals)
  }
  addGoal(goal: Omit<Goal, 'id' | 'createdAt'>): Promise<Goal> {
    const g: Goal = { ...goal, id: genId(), createdAt: new Date().toISOString() }
    return this.tx(STORES.goals, 'readwrite', (os) => os.add(g)).then(() => g)
  }
  updateGoal(id: string, patch: Partial<Goal>): Promise<void> {
    return this.getAll<Goal>(STORES.goals).then((list) => {
      const g = list.find((x) => x.id === id)
      if (!g) return
      const next = { ...g, ...patch, id }
      return this.tx(STORES.goals, 'readwrite', (os) => os.put(next)).then(() => undefined)
    })
  }
  deleteGoal(id: string): Promise<void> {
    return this.tx(STORES.goals, 'readwrite', (os) => os.delete(id)).then(() => undefined)
  }

  // ---- Logs ----
  listLogs(): Promise<Log[]> {
    return this.getAll<Log>(STORES.logs)
  }
  addLog(log: Omit<Log, 'id' | 'createdAt'>): Promise<Log> {
    const l: Log = { ...log, id: genId(), createdAt: new Date().toISOString() }
    return this.tx(STORES.logs, 'readwrite', (os) => os.add(l)).then(() => l)
  }
  updateLog(id: string, patch: Partial<Log>): Promise<void> {
    return this.getAll<Log>(STORES.logs).then((list) => {
      const l = list.find((x) => x.id === id)
      if (!l) return
      const next = { ...l, ...patch, id }
      return this.tx(STORES.logs, 'readwrite', (os) => os.put(next)).then(() => undefined)
    })
  }
  deleteLog(id: string): Promise<void> {
    return this.tx(STORES.logs, 'readwrite', (os) => os.delete(id)).then(() => undefined)
  }

  // ---- Reviews ----
  listReviews(): Promise<Review[]> {
    return this.getAll<Review>(STORES.reviews)
  }
  addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    const r: Review = { ...review, id: genId(), createdAt: new Date().toISOString() }
    return this.tx(STORES.reviews, 'readwrite', (os) => os.add(r)).then(() => r)
  }
  updateReview(id: string, patch: Partial<Review>): Promise<void> {
    return this.getAll<Review>(STORES.reviews).then((list) => {
      const r = list.find((x) => x.id === id)
      if (!r) return
      const next = { ...r, ...patch, id }
      return this.tx(STORES.reviews, 'readwrite', (os) => os.put(next)).then(() => undefined)
    })
  }
  deleteReview(id: string): Promise<void> {
    return this.tx(STORES.reviews, 'readwrite', (os) => os.delete(id)).then(() => undefined)
  }

  async exportAll(): Promise<{ goals: Goal[]; logs: Log[]; reviews: Review[] }> {
    const [goals, logs, reviews] = await Promise.all([
      this.listGoals(),
      this.listLogs(),
      this.listReviews(),
    ])
    return { goals, logs, reviews }
  }

  async importAll(data: { goals: Goal[]; logs: Log[]; reviews: Review[] }): Promise<void> {
    const db = await this.open()
    const stores = [STORES.goals, STORES.logs, STORES.reviews]
    for (const store of stores) {
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, 'readwrite')
        t.objectStore(store).clear()
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      })
    }
    await Promise.all([
      ...data.goals.map((g) => this.tx(STORES.goals, 'readwrite', (os) => os.put(g))),
      ...data.logs.map((l) => this.tx(STORES.logs, 'readwrite', (os) => os.put(l))),
      ...data.reviews.map((r) => this.tx(STORES.reviews, 'readwrite', (os) => os.put(r))),
    ])
  }
}
