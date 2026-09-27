/**
 * 渲染冒烟 —— 确认页面在「真的渲染一次」的时候不会崩
 *
 * 为什么需要它：`tsc` 和 `vite build` 都是绿的，但 App 曾经在浏览器里白屏 ——
 * 因为 `if (!repo) return` 写在了三个 useState 前面，React 抛 #310
 * （Rendered more hooks than during the previous render）。
 * 构建工具不跑渲染，这类问题只有真正渲染一次才会暴露。
 *
 * 做法：用 react-dom/server 把组件渲染成 HTML 字符串再断言内容。
 * Vite 项目的 .tsx 不能被 node 直接 import，所以走 vite 的 ssrLoadModule。
 *
 * 已知边界：SSR 不执行 useEffect，因此只能验证「首屏渲染不抛错 + 内容正确」，
 * 交互（点击、切换页签、IndexedDB 落盘）测不到。这部分在浏览器里另行确认。
 * 见 scripts/README 或运行时输出里的提示。
 */
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* ---------- 浏览器 API 打桩（必须在 ssrLoadModule 之前） ---------- */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
})
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.window = globalThis
globalThis.window.location = { hash: '', pathname: '/', origin: 'http://localhost' }
globalThis.window.addEventListener = () => {}
globalThis.window.removeEventListener = () => {}
globalThis.window.scrollTo = () => {}
globalThis.window.scrollY = 0
globalThis.document = {
  // 这几个桩必须给全，否则 React 内部报 isSupported.setAttribute is not a function
  documentElement: {
    dataset: {}, setAttribute() {}, removeAttribute() {},
    getAttribute: () => null, style: {}, scrollHeight: 5000,
  },
  body: { setAttribute() {}, removeAttribute() {}, style: {}, appendChild: () => {} },
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, remove() {}, appendChild() {}, select() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
}

/* ---------- 断言 ---------- */
const checks = []
const check = (name, cond, detail = '') => checks.push([name, !!cond, detail])
const has = (html, s) => html.includes(s)

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const mod = await server.ssrLoadModule('/src/App.tsx')
  const App = mod.default ?? mod.App
  if (!App) throw new Error('App 未导出')

  const { EmptyState } = await server.ssrLoadModule('/src/components/EmptyState.tsx')
  const { TodayTable } = await server.ssrLoadModule('/src/components/TodayTable.tsx')
  const { BoardView } = await server.ssrLoadModule('/src/components/BoardView.tsx')
  const { WeekReview } = await server.ssrLoadModule('/src/components/WeekReview.tsx')
  const { MineView } = await server.ssrLoadModule('/src/components/MineView.tsx')
  const { PageHead } = await server.ssrLoadModule('/src/components/PageHead.tsx')
  const { buildSampleData } = await server.ssrLoadModule('/src/lib/sample.ts')
  const { buildGoalView } = await server.ssrLoadModule('/src/lib/eta.ts')

  const render = (el) => renderToStaticMarkup(el)

  // 1) App 整体：repo 还在异步解析中，SSR 下应渲染「初始化中…」而不是抛错
  let appHtml = ''
  try {
    appHtml = render(React.createElement(App))
    check('App 渲染不抛错', true)
    check('App 首屏渲染出占位（repo 未就绪）', has(appHtml, '初始化中'))
  } catch (e) {
    check(`App 渲染抛错: ${e.message}`, false)
  }

  // 2) 四个页签 + 页头，用示例数据作为 fixture
  const TODAY = '2026-09-27'
  const data = buildSampleData(TODAY)
  const views = data.goals.map((g) => buildGoalView(g, data.logs, TODAY))

  const todayHtml = render(React.createElement(TodayTable, { views, logs: data.logs, onCheckIn: () => {}, today: TODAY }))
  check('今日页渲染出标题', has(todayHtml, '今日打卡'))
  check('今日页列出了全部 4 个目标', views.every((v) => has(todayHtml, v.name)))
  check('今日页带出打卡按钮', has(todayHtml, '打卡'))

  const boardHtml = render(React.createElement(BoardView, { views, logs: data.logs, onCheckIn: () => {}, today: TODAY }))
  check('看板渲染出标题', has(boardHtml, '看板'))
  check('看板渲染出 SVG 进度环', has(boardHtml, '<svg'))
  check('看板列出了全部 4 个目标', views.every((v) => has(boardHtml, v.name)))
  check('看板能同时看到四种状态',
    ['正常推进', '可能延期', '已逾期', '已完成'].every((s) => has(boardHtml, s)))
  // 已完成的目标不该还标着「逾期 N 天」——那是给没做完的目标看的
  check('已完成的目标显示「已达成」而非逾期文案', has(boardHtml, '已达成'))
  check('已完成的目标不显示「预计 0 天完成」', !has(boardHtml, '预计 0 天完成'))
  // 图表：柱子必须真的按目标分色，不能图例四色、柱子一色
  {
    const fills = [...boardHtml.matchAll(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1])
    const goalColors = views.map((v) => v.color)
    const stacked = fills.filter((f) => goalColors.includes(f))
    check('图表柱子按目标分色（至少 2 种目标色）', new Set(stacked).size >= 2,
      `实际配色: ${[...new Set(stacked)].join(',')}`)
    check('图表每根柱子都带悬停明细', (boardHtml.match(/<title>/g) || []).length > 0)
  }

  const weekHtml = render(React.createElement(WeekReview, { reviews: data.reviews, onSubmit: async () => {} }))
  check('周报渲染出标题', has(weekHtml, '本周复盘'))
  check('周报显示出已保存的复盘内容', has(weekHtml, '保持'))

  const mineHtml = render(
    React.createElement(MineView, {
      onExport: async () => data,
      onImport: async () => {},
      onLoadSample: async () => {},
      onClearAll: async () => {},
      hasSample: true,
      repoKind: 'indexeddb',
    }),
  )
  check('我的页渲染出数据管理', has(mineHtml, '数据管理'))
  check('我的页有导出 / 导入', has(mineHtml, '导出 JSON') && has(mineHtml, '导入 JSON'))
  check('我的页有重置示例 / 清除全部', has(mineHtml, '重置示例数据') && has(mineHtml, '清除全部数据'))
  check('我的页无示例时按钮文案切换为「载入示例数据」',
    has(render(React.createElement(MineView, {
      onExport: async () => data, onImport: async () => {}, onLoadSample: async () => {},
      onClearAll: async () => {}, hasSample: false, repoKind: 'indexeddb',
    })), '载入示例数据'))

  // 3) 空态：第一次打开时看到的就是它，不能是「白屏 + 暂无数据」
  const emptyHtml = render(
    React.createElement(EmptyState, { onLoadSample: () => {}, onAddGoal: () => {} }),
  )
  check('空态渲染出标题', has(emptyHtml, '这里还没有目标'))
  check('空态给出两条出路', has(emptyHtml, '载入示例数据') && has(emptyHtml, '新建一个目标'))
  check('空态说明了「不是加载失败」', has(emptyHtml, '不是加载失败'))

  // 4) 页头芯片与统计口径
  const headHtml = render(React.createElement(PageHead, { views }))
  check('页头显示目标总数 4', has(headHtml, '共 4 个目标'))
  check('页头把逾期/延期归入「需关注」', has(headHtml, '需关注 2'))
  check('页头显示已完成 1', has(headHtml, '已完成 1'))
} catch (err) {
  check(`模块加载或渲染失败: ${err.message}`, false)
} finally {
  await server.close().catch(() => {})
}

let failed = 0
for (const [name, ok, detail] of checks) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
console.log(`\n结果: ${checks.length - failed}/${checks.length} 通过`)
console.log('（注：SSR 不执行 useEffect，交互与 IndexedDB 落盘不在本脚本覆盖范围内）')
process.exit(failed ? 1 : 0)
