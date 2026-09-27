/**
 * 日期工具 —— 纯函数，可单测
 */

/** 取本地时区今天的 ISO 日期（YYYY-MM-DD） */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 两个 ISO 日期相差的天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/** 今天偏移 n 天的 ISO 日期 */
export function offsetDays(n: number, base: string = isoDate()): string {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** d 所在周的周一 ISO 日期 */
export function mondayOf(d: string): string {
  const date = new Date(d + 'T00:00:00')
  const dow = date.getDay() // 0=周日
  const diff = dow === 0 ? -6 : 1 - dow
  return offsetDays(diff, d)
}

/** 最近 n 天的 ISO 日期数组（含今天，从旧到新） */
export function recentDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(offsetDays(-i))
  return out
}

/** 友好显示：「3 天后」「逾期 2 天」「今天截止」 */
export function humanDue(dueDays: number): string {
  if (dueDays === 0) return '今天截止'
  if (dueDays > 0) return `${dueDays} 天后截止`
  return `逾期 ${Math.abs(dueDays)} 天`
}
