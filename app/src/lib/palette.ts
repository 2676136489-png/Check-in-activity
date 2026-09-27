/**
 * 低饱和学术配色板 —— 与纸底/墨绿主色和谐
 * 避免高饱和色干扰阅读，每个色取低明度、低饱和
 */
export const PALETTE = [
  '#2c6b5c', // 深绿
  '#9a6b2e', // 赭石
  '#a2382c', // 砖红
  '#3a6b8c', // 灰蓝
  '#6b5a8c', // 灰紫
  '#8c5a3a', // 棕褐
  '#4a8c5c', // 苔绿
  '#7a7a3a', // 橄榄
] as const

/** 取第 i 个颜色（循环） */
export function colorAt(i: number): string {
  return PALETTE[i % PALETTE.length]
}

/** 状态色 */
export const STATUS_COLOR: Record<string, string> = {
  'on-track': '#2c6b5c',
  'at-risk': '#9a6b2e',
  overdue: '#a2382c',
  done: '#4a8c5c',
}
