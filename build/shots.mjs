// 用 Playwright 在 PC / iOS / Android 三端尺寸下截图，用于诊断视觉与适配问题。
// 数据走线上三表（真实页面），若网络不可用则仅渲染界面骨架。
import path from 'node:path';
import fs from 'node:fs';

const { chromium } = await import('file:///C:/Users/111/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs');
const CHROME = 'C:/Users/111/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FILE = 'file:///' + path.join(ROOT, '学习目标管理台.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'build', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'pc-1440', w: 1440, h: 960, dpr: 1, mobile: false, touch: false },
  { name: 'pc-1920', w: 1920, h: 1080, dpr: 1, mobile: false, touch: false },
  { name: 'ipad-834', w: 834, h: 1112, dpr: 2, mobile: true, touch: true },
  { name: 'iphone-390', w: 390, h: 844, dpr: 3, mobile: true, touch: true },
  { name: 'iphone-se-375', w: 375, h: 667, dpr: 2, mobile: true, touch: true },
  { name: 'android-360', w: 360, h: 800, dpr: 3, mobile: true, touch: true },
  { name: 'android-narrow-320', w: 320, h: 720, dpr: 2, mobile: true, touch: true },
];

const TABS = ['today', 'board', 'week', 'mine'];

const browser = await chromium.launch({ executablePath: CHROME });

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    isMobile: d.mobile,
    hasTouch: d.touch,
    userAgent: d.mobile
      ? (d.name.startsWith('iphone')
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
      : undefined,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2200); // 等数据拉取

  for (const t of TABS) {
    await page.evaluate((tab) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
      window.scrollTo(0, 0);
    }, t);
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(OUT, `${d.name}--${t}.png`), fullPage: t === 'today' });
  }

  // 收集布局诊断：横向溢出、元素越界
  const diag = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        over.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.toString().slice(0, 60)) || '',
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        });
      }
    });
    return {
      vw,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      hOverflow: document.documentElement.scrollWidth > vw,
      overflow: over.slice(0, 14),
      tabCount: document.querySelectorAll('.nav-btn').length,
    };
  });

  console.log(`\n=== ${d.name} (${d.w}x${d.h} dpr${d.dpr}) ===`);
  console.log('  viewport', diag.vw, 'scrollWidth', diag.scrollW, '横向溢出:', diag.hOverflow);
  if (diag.overflow.length) {
    console.log('  越界元素:');
    diag.overflow.forEach(o => console.log(`    <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.w}`));
  }
  if (errs.length) console.log('  控制台错误:', errs.slice(0, 5));

  await ctx.close();
}

await browser.close();
console.log('\n截图输出目录:', OUT);
