/**
 * Repository 工厂 —— 根据环境选择适配器
 *
 * - 默认 IndexedDB（离线可用、零配置）
 * - 若提供 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY，则启用 Supabase
 */
import type { Repository } from './types'
import type { SupabaseClientLike } from './supabase'
import { IndexedDBRepo } from './indexeddb'

export async function createRepo(): Promise<Repository> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && anon) {
    try {
      const [{ createClient }, { SupabaseRepo }] = await Promise.all([
        import('@supabase/supabase-js'),
        import('./supabase'),
      ])
      return new SupabaseRepo(createClient(url, anon) as unknown as SupabaseClientLike)
    } catch {
      // 未安装 @supabase/supabase-js 时回退到 IndexedDB
      return new IndexedDBRepo()
    }
  }
  return new IndexedDBRepo()
}

export type { Repository } from './types'
export { IndexedDBRepo } from './indexeddb'
export { SupabaseRepo } from './supabase'
