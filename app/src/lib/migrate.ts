/**
 * 备份迁移 —— 把「单文件版」导出的备份读成工程化版的导入格式
 *
 * 两套实现导出的备份长得像，字段名却对不上；更麻烦的是工程化版的 IndexedDB
 * 以 id 作主键，而单文件版的备份里根本没有 id：
 *
 *   单文件版 goals:  { name, unit, total, due, color, blocker, counter, seed, sort }
 *   工程化版 goals:  { id, name, unit, total, due, color, obstacle, countermeasure, isSeed, order, createdAt }
 *
 * 把单文件版的备份直接丢进「导入 JSON」，会在 put() 那一步因为没有 id 抛 DataError，
 * 界面上只剩一句「文件格式错误」—— 到底哪个字段不对，从这句话里看不出来。
 * 所以这里不按格式分支走，而是逐字段认：新旧键名都接受，缺的补默认值，
 * 补不出来的（记录找不到目标、目标没有名称）就跳过并计数，最后把 warnings 交回界面。
 *
 * 全部是纯函数，日期与 id 都从参数注入，便于单测钉死。
 */
import type { Goal, Log, Review } from '@/types'
import { isoDate, offsetDays } from './date'
import { colorAt } from './palette'

type Rec = Record<string, unknown>

export interface ImportBundle {
  goals: Goal[]
  logs: Log[]
  reviews: Review[]
}

/** native = 工程化版自己的备份；legacy = 单文件版备份 */
export type BackupSource = 'native' | 'legacy'

export interface NormalizeResult {
  bundle: ImportBundle
  source: BackupSource
  counts: { goals: number; logs: number; reviews: number }
  /** 能直接显示给用户看的说明，例：跳过 2 条打卡记录（找不到对应的目标） */
  warnings: string[]
}

export type ImportSummary = Omit<NormalizeResult, 'bundle'>

/** 备份读不通时抛出，message 是能直接展示的中文 */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFormatError'
  }
}

export interface NormalizeOptions {
  /** 「今天」的 ISO 日期，用于补缺失的截止日；默认本机今天 */
  today?: string
  /** 新记录的 createdAt；默认当前时刻 */
  nowIso?: string
  /** id 生成器；测试里传确定性实现 */
  idFactory?: () => string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** 单文件版里，目标没填截止日时给的默认期限 */
const DEFAULT_DUE_DAYS = 30

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 按顺序取第一个有值的键 —— 用来兼容两套键名 */
function pick(rec: Rec, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = rec[k]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

function toNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v === 'true' || v === '1'
  return false
}

/** 日期取前 10 位；不是合法 YYYY-MM-DD 就用 fallback（传空串表示「没有日期」） */
function toDay(v: unknown, fallback: string): string {
  const s = text(v).slice(0, 10)
  return DATE_RE.test(s) ? s : fallback
}

/** 用时：空串 / null 一律当作「没记」，而不是 0 分钟 */
function toMinutes(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = toNum(v, Number.NaN)
  return Number.isFinite(n) ? n : undefined
}

function makeIdFactory(): () => string {
  let n = 0
  return () => `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 判断备份来自哪一版。
 * 只看第一条有内容的记录：带 id / order / obstacle 的是工程化版，其余算单文件版。
 */
export function detectSource(raw: unknown): BackupSource {
  if (!isRec(raw)) return 'legacy'
  const firstRec = (arr: unknown): Rec | undefined =>
    Array.isArray(arr) ? (arr.find(isRec) as Rec | undefined) : undefined

  const g = firstRec(raw.goals)
  if (g) return 'id' in g || 'order' in g || 'obstacle' in g || 'countermeasure' in g ? 'native' : 'legacy'
  const l = firstRec(raw.logs)
  if (l) return 'goalId' in l || 'backfilled' in l ? 'native' : 'legacy'
  const r = firstRec(raw.reviews)
  if (r) return 'weekStart' in r || 'problem' in r || 'nextWeekPlan' in r ? 'native' : 'legacy'
  return 'legacy'
}

/** 把任意一版的备份读成工程化版的导入数据；读不通就抛 BackupFormatError */
export function normalizeBackup(raw: unknown, opts: NormalizeOptions = {}): NormalizeResult {
  if (!isRec(raw)) {
    throw new BackupFormatError('这不是备份文件：最外层应该是一个 JSON 对象')
  }
  if (!Array.isArray(raw.goals)) {
    throw new BackupFormatError('这不是备份文件：找不到 goals 数组')
  }

  const today = opts.today ?? isoDate()
  const now = opts.nowIso ?? new Date().toISOString()
  const nextId = opts.idFactory ?? makeIdFactory()
  const source = detectSource(raw)
  const warnings: string[] = []

  // ---- 目标 ----
  const goals: Goal[] = []
  const nameToId = new Map<string, string>()
  let goalSkipped = 0
  let goalDupName = 0

  raw.goals.forEach((item, i) => {
    if (!isRec(item)) {
      goalSkipped++
      return
    }
    const name = text(item.name)
    if (!name) {
      goalSkipped++
      return
    }
    const id = text(pick(item, 'id')) || nextId()
    goals.push({
      id,
      name,
      unit: text(item.unit) || '个',
      total: Math.max(1, toNum(item.total, 1)),
      due: toDay(item.due, offsetDays(DEFAULT_DUE_DAYS, today)),
      color: text(item.color) || colorAt(i),
      obstacle: text(pick(item, 'obstacle', 'blocker')) || undefined,
      countermeasure: text(pick(item, 'countermeasure', 'counter')) || undefined,
      isSeed: toBool(pick(item, 'isSeed', 'seed')),
      order: toNum(pick(item, 'order', 'sort'), i),
      createdAt: text(pick(item, 'createdAt')) || now,
    })
    if (nameToId.has(name)) goalDupName++
    else nameToId.set(name, id)
  })

  if (goals.length === 0) {
    // 空目标会走到「先清空再写入」，等于把现有数据删了却什么都没换回来
    throw new BackupFormatError(
      goalSkipped > 0
        ? '备份里的目标都没有名称，没有可导入的内容'
        : '备份里没有任何目标，已中止导入（避免清空现有数据）',
    )
  }
  if (goalSkipped > 0) warnings.push(`跳过 ${goalSkipped} 个没有名称的目标`)
  if (goalDupName > 0) warnings.push(`${goalDupName} 个目标重名，同名打卡记录会挂到第一个上`)

  const goalIds = new Set(goals.map((g) => g.id))
  const idToName = new Map(goals.map((g) => [g.id, g.name]))

  // ---- 打卡记录 ----
  const logs: Log[] = []
  let logSkipped = 0
  const rawLogs = Array.isArray(raw.logs) ? raw.logs : []

  rawLogs.forEach((item) => {
    if (!isRec(item)) {
      logSkipped++
      return
    }
    let goalId = text(item.goalId)
    if (goalId && !goalIds.has(goalId)) goalId = '' // id 失配就退回按名称找
    let goalName = text(item.goalName)
    if (!goalId) {
      const matched = goalName ? nameToId.get(goalName) : undefined
      if (!matched) {
        logSkipped++
        return
      }
      goalId = matched
    }
    goalName = idToName.get(goalId) ?? goalName

    logs.push({
      id: text(pick(item, 'id')) || nextId(),
      goalId,
      goalName,
      date: toDay(item.date, today),
      amount: toNum(item.amount, 0),
      minutes: toMinutes(item.minutes),
      backfilled: toBool(pick(item, 'backfilled', 'makeup')),
      createdAt: text(pick(item, 'createdAt')) || now,
    })
  })
  if (logSkipped > 0) warnings.push(`跳过 ${logSkipped} 条打卡记录（找不到对应的目标）`)

  // ---- 周复盘：一周只留一条，后来的覆盖前面的 ----
  const reviewByWeek = new Map<string, Review>()
  let reviewSkipped = 0
  let reviewReplaced = 0
  const rawReviews = Array.isArray(raw.reviews) ? raw.reviews : []

  rawReviews.forEach((item) => {
    if (!isRec(item)) {
      reviewSkipped++
      return
    }
    const weekStart = toDay(pick(item, 'weekStart', 'week'), '')
    if (!weekStart) {
      reviewSkipped++
      return
    }
    if (reviewByWeek.has(weekStart)) reviewReplaced++
    reviewByWeek.set(weekStart, {
      id: text(pick(item, 'id')) || nextId(),
      weekStart,
      keep: text(item.keep),
      problem: text(pick(item, 'problem', 'issue')),
      try: text(pick(item, 'try', 'tryIt')),
      nextWeekPlan: text(pick(item, 'nextWeekPlan', 'plan')),
      createdAt: text(pick(item, 'createdAt')) || now,
    })
  })
  if (reviewSkipped > 0) warnings.push(`跳过 ${reviewSkipped} 条没有周起始日期的复盘`)
  if (reviewReplaced > 0) warnings.push(`${reviewReplaced} 条同一周的复盘被较新的覆盖`)

  const reviews = [...reviewByWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  return {
    bundle: {
      goals: goals.sort((a, b) => a.order - b.order),
      logs,
      reviews,
    },
    source,
    counts: { goals: goals.length, logs: logs.length, reviews: reviews.length },
    warnings,
  }
}

/** 把结果拼成一句给用户看的摘要 */
export function describeImport(result: ImportSummary): string {
  const { counts } = result
  const head =
    result.source === 'legacy'
      ? '已识别为单文件版备份，字段名自动转换完成'
      : '已识别为工程化版备份'
  const body = `导入 ${counts.goals} 个目标 · ${counts.logs} 条打卡记录 · ${counts.reviews} 条周复盘`
  return result.warnings.length ? `${head}\n${body}\n\n注意：\n- ${result.warnings.join('\n- ')}` : `${head}\n${body}`
}
