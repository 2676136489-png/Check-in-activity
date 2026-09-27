/**
 * 生成 README 里用的实拍图（输出到 ../docs/）
 *
 * 为什么把截图脚本也入库：README 里的图如果不是可复现的，它就和设计稿没区别了。
 * 这个脚本在真实浏览器里打开构建产物、点「载入示例数据」、再各页签截图，
 * 所以图里的每一处文案都是真的跑出来的。
 *
 * 用法：
 *   npm run build
 *   npm run preview          # 另开一个终端
 *   node scripts/shots.mjs   # 可用第一个参数覆盖地址
 *
 * 注意：需要在 http 下跑，不能用 file://——ES module 会被 CORS 拦掉。
 */
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const { chromium } = await import('file:///C:/Users/111/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs')
const CHROME = process.env.CHROME_PATH ?? 'C:/Users/111/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'docs')
fs.mkdirSync(OUT, { recursive: true })

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:4173/'

const browser = await chromium.launch({ executablePath: CHROME })

/** 开一个新 context，打开页面并把示例数据载进去 —— 空态截图没有信息量 */
async function openWithSample(viewport, dpr, mobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
  })
  const page = await ctx.newPage()
  await page.goto(URL_BASE, { waitUntil: 'load' })
  await page.waitForSelector('text=这里还没有目标', { timeout: 15000 })
  await page.click('text=载入示例数据')
  await page.waitForTimeout(900)
  return { ctx, page }
}

try {
  // 桌面 · 今日
  {
    const { ctx, page } = await openWithSample({ width: 1280, height: 860 }, 2, false)
    await page.screenshot({ path: path.join(OUT, 'app-today-desktop.png') })
    await ctx.close()
  }

  // 桌面 · 看板（视口拉高，让 14 天图表完整入镜）
  {
    const { ctx, page } = await openWithSample({ width: 1280, height: 1300 }, 2, false)
    await page.click('text=看板')
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(OUT, 'app-board-desktop.png') })

    // 顺手断言几件不该回归的事
    const txt = await page.evaluate(() => document.querySelector('main').innerText)
    const problems = []
    if (!txt.includes('已达成')) problems.push('已完成的目标没有显示「已达成」')
    if (txt.includes('预计 0 天完成')) problems.push('已完成的目标仍在显示「预计 0 天完成」')
    if (problems.length) {
      console.error('截图已生成，但发现回归：')
      for (const p of problems) console.error('  ✗ ' + p)
      await ctx.close()
      await browser.close()
      process.exit(1)
    }
    await ctx.close()
  }

  // 移动端 · 今日
  {
    const { ctx, page } = await openWithSample({ width: 390, height: 844 }, 3, true)
    await page.screenshot({ path: path.join(OUT, 'app-today-mobile.png') })
    await ctx.close()
  }

  console.log('已生成:', OUT)
  console.log('  app-today-desktop.png / app-board-desktop.png / app-today-mobile.png')
} finally {
  await browser.close()
}
