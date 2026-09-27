// 用真实数据形状喂给页面（拦截 __SMART_PAGE__.database.query），
// 目的是看「有数据时」的目标卡、看板、周报在各端宽下的真实观感。
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import('file:///C:/Users/111/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs');
const CHROME = 'C:/Users/111/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FILE = 'file:///' + path.join(ROOT, '学习目标管理台.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'build', 'shots2');
fs.mkdirSync(OUT, { recursive: true });

/* 预置与页面「示例数据」一致的三组目标 + 最近几天的打卡记录，
   用来观察有数据时目标卡/看板/周报的真实观感。 */
const T = new Date();
const D = (n) => { const d = new Date(T); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const MON = (() => { const d = new Date(T); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const DB_G = 'BIidtdjTZqaX8pBamGfpwG', DB_L = 'EWKqAtHl8V6s9UaAHpYd69', DB_R = 'bMjplT6TsrTmhwH8BxZKIE';

const GOALS = [
  { id: 'g1', name: '背完考研核心词', unit: '个', total: 2000, due: D(45), color: '#6366f1', blocker: '晚上一躺下就开始刷手机', counter: '把手机放到客厅，先背 20 个再拿回来', seed: 1 },
  { id: 'g2', name: '读完《人类简史》', unit: '页', total: 440, due: D(-3), color: '#f59e0b', blocker: '加班回来太累', counter: '只看 10 页也算数', seed: 1 },
  { id: 'g3', name: 'Python 入门课', unit: '节', total: 60, due: D(30), color: '#10b981', blocker: '', counter: '', seed: 1 },
];
const LOGS = [];
const AMTS = { g1: [120, 80, 150, 100, 60, 90], g2: [30, 20, 0, 25, 15, 18], g3: [2, 3, 1, 2, 0, 2] };
for (let k = 0; k < 6; k++) {
  ['g1', 'g2', 'g3'].forEach(gid => {
    const a = AMTS[gid][k];
    if (!a) return;
    LOGS.push({
      id: gid + '_' + k, goalId: gid, goalName: GOALS.find(g => g.id === gid).name,
      date: D(-k - 1), amount: a, minutes: k % 3 === 0 ? a : '', makeup: k > 2 ? 1 : '',
    });
  });
}
const REVS = [{ id: 'r1', week: MON, keep: '早上通勤背单词效率最高', issue: '晚上基本没时间', tryIt: '午休先背 20 个', plan: '21 点还没开始就只做 10 个' }];


/* 真实的 __SMART_PAGE__.database.query 返回的是「已展开」的普通值
   （页面 pullAll 里直接读 r['名称'] 这种标量）。所以这里注入的也必须是标量，
   不能塞 {type,value} 对象，否则页面上会显示 [object Object]。 */
const recs = {
  [DB_G]: GOALS.map((g, i) => ({
    record_id: g.id || ('g' + i),
    '名称': g.name, '单位': g.unit, '总量': Number(g.total) || 0,
    '截止日': g.due, '配色': g.color, '障碍': g.blocker,
    '对策': g.counter, '是否示例': !!g.seed, '排序': i,
  })),
  [DB_L]: LOGS.map((l, i) => ({
    record_id: l.id || ('l' + i),
    '目标ID': l.goalId, '目标名': l.goalName, '日期': l.date,
    '打卡量': Number(l.amount) || 0,
    '分钟数': (l.minutes === '' || l.minutes == null) ? null : Number(l.minutes),
    '补记': !!l.makeup,
  })),
  [DB_R]: REVS.map((r, i) => ({
    record_id: r.id || ('r' + i),
    '周起始': r.week, '保持': r.keep, '问题': r.issue,
    '尝试': r.tryIt, '下周预案': r.plan,
  })),
};


const DEVICES = [
  { name: 'pc-1440', w: 1440, h: 1000, dpr: 1, mobile: false },
  { name: 'pc-1920', w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'ipad-834', w: 834, h: 1112, dpr: 2, mobile: true },
  { name: 'iphone-390', w: 390, h: 844, dpr: 3, mobile: true },
  { name: 'android-360', w: 360, h: 800, dpr: 3, mobile: true },
  { name: 'android-320', w: 320, h: 720, dpr: 2, mobile: true },
];

const browser = await chromium.launch({ executablePath: CHROME });

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr,
    isMobile: d.mobile, hasTouch: d.mobile,
  });
  const page = await ctx.newPage();

  // 在页面脚本运行前注入 SDK 桩
  await page.addInitScript(({ recs }) => {
    window.__SMART_PAGE__ = {
      database: {
        query({ databaseId }) {
          const rows = recs[databaseId] || [];
          return Promise.resolve({ results: rows, hasMore: false, nextCursor: null });
        },
        addRecord() { return Promise.resolve({ record_id: 'new' }); },
        updateRecord() { return Promise.resolve({}); },
        deleteRecord() { return Promise.resolve({}); },
      },
    };
  }, { recs });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  for (const t of ['today', 'board', 'week']) {
    await page.evaluate((tab) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
      window.scrollTo(0, 0);
    }, t);
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(OUT, `${d.name}--${t}.png`), fullPage: false });
  }

  // 展开一个打卡面板，看展开态
  await page.evaluate(() => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'today'));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-today'));
    const b = document.querySelector('[data-act="toggle"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${d.name}--checkin-open.png`), fullPage: false });

  // 新建表单
  await page.evaluate(() => { const b = document.getElementById('btn-new-top'); if (b) b.click(); });
  await page.waitForTimeout(360);
  await page.screenshot({ path: path.join(OUT, `${d.name}--form.png`), fullPage: false });

  const info = await page.evaluate(() => ({
    goals: document.querySelectorAll('.goal').length,
    navH: Math.round((document.querySelector('.nav') || {}).getBoundingClientRect ? document.querySelector('.nav').getBoundingClientRect().height : 0),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log(`${d.name.padEnd(14)} 目标卡=${info.goals} nav高=${info.navH} 横向溢出=${info.overflow}`);
  await ctx.close();
}
await browser.close();
console.log('\n输出:', OUT);
