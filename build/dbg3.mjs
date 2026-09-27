// 复用 smoke.mjs 的 jsdom + mock SDK 环境，把关注区真实 DOM 打出来
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/111/.workbuddy/binaries/node/workspace/');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(new URL('../学习目标管理台.html', import.meta.url), 'utf8');
const T = new Date();
const p = n => (n < 10 ? '0' + n : '' + n);
const ds = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const add = (s, n) => { const [y, m, d] = s.split('-').map(Number); const dd = new Date(y, m - 1, d); dd.setDate(dd.getDate() + n); return ds(dd); };
const TODAY = ds(T);
const back = n => add(TODAY, -n);

const GOAL_ROWS = [
  { 名称: '背英语单词', 单位: '个', 总量: 2000, 截止日: add(TODAY, 45) + 'T00:00:00.000Z', 配色: '#6366f1', 障碍: '晚上一躺下就开始刷手机', 对策: '把手机放到客厅，先背 20 个再拿回来', 是否示例: true, 排序: 1 },
  { 名称: '读《人类简史》', 单位: '页', 总量: 440, 截止日: add(TODAY, 30) + 'T00:00:00.000Z', 配色: '#10b981', 障碍: '通勤地铁太挤，看不进去', 对策: '改听音频版，或者睡前读 10 页', 是否示例: true, 排序: 2 },
  { 名称: 'Python 入门课', 单位: '节', 总量: 60, 截止日: back(2) + 'T00:00:00.000Z', 配色: '#f59e0b', 障碍: '第 3 节之后就卡住了', 对策: '只要求每天 1 节，练习跳过也没关系', 是否示例: true, 排序: 3 }
];
const LOG_ROWS = [];
[[8, 40, 30], [7, 45, 32], [6, 35, 25], [5, 50, 35], [4, 30, 20], [3, 40, 28], [2, 45, 30]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g0', 目标名: '背英语单词', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: m, 补记: d === 2 });
});
[[6, 20, 35], [5, 18, 30], [4, 22, 40], [3, 15, 25], [2, 25, 45], [1, 20, 33]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g1', 目标名: '读《人类简史》', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: (d === 4 ? null : m), 补记: false });
});
[[12, 2, 50], [10, 1, 40], [9, 2, 55], [8, 1, 30], [6, 3, 70], [5, 2, 45]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g2', 目标名: 'Python 入门课', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: m, 补记: false });
});
const REVIEW_ROWS = [{ 周起始: back(7) + 'T00:00:00.000Z', 保持: '早上通勤背单词效率最高', 问题: '', 尝试: '', 下周预案: '' }];

const store = { goals: GOAL_ROWS.map((r, i) => ({ record_id: 'rec_g' + i, ...r })), logs: LOG_ROWS.map((r, i) => ({ record_id: 'rec_l' + i, ...r })), reviews: REVIEW_ROWS.map((r, i) => ({ record_id: 'rec_r' + i, ...r })) };
const calls = { add: [], update: [], del: [] };
let seq = 100;
function mkTable(rows) {
  return {
    query: ({ pageSize = 200, startCursor }) => {
      const start = startCursor ? Number(String(startCursor).split('_')[1]) : 0;
      const page = rows.slice(start, start + pageSize).map(r => ({ ...r }));
      const next = start + pageSize < rows.length ? 'c_' + (start + pageSize) : null;
      return Promise.resolve({ results: page, hasMore: !!next, nextCursor: next });
    },
    addRecord: ({ databaseId, properties }) => { const flat = {}; Object.keys(properties).forEach(k => { const v = properties[k]; flat[k] = v && typeof v === 'object' ? Object.values(v)[0] : v; }); calls.add.push({ databaseId, flat }); const id = 'new' + (++seq); rows.push({ record_id: id, ...flat }); return Promise.resolve({ id }); },
    updateRecord: ({ recordId, properties }) => { calls.update.push({ recordId }); const r = rows.find(x => x.record_id === recordId); if (r) Object.assign(r, {}); return Promise.resolve({ id: recordId }); },
    deleteRecord: ({ recordId }) => { calls.del.push(recordId); const i = rows.findIndex(x => x.record_id === recordId); if (i >= 0) rows.splice(i, 1); return Promise.resolve({}); }
  };
}
const handles = {};
['BIidtdjTZqaX8pBamGfpwG', 'EWKqAtHl8V6s9UaAHpYd69', 'bMjplT6TsrTmhwH8BxZKIE'].forEach((k, i) => { handles[k] = mkTable([store.goals, store.logs, store.reviews][i]); });
const dbObj = {
  getSchema: () => Promise.resolve({ properties: [] }),
  query: ({ databaseId, pageSize, startCursor }) => handles[databaseId].query({ pageSize, startCursor }),
  addRecord: ({ databaseId, properties }) => handles[databaseId].addRecord({ databaseId, properties }),
  updateRecord: ({ databaseId, recordId, properties }) => handles[databaseId].updateRecord({ recordId, properties }),
  deleteRecord: ({ databaseId, recordId }) => handles[databaseId].deleteRecord({ recordId })
};

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  beforeParse(window) {
    Object.defineProperty(window, '__SMART_PAGE__', { configurable: true, get() { return { database: dbObj }; } });
    window.scrollTo = () => {};
    window.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
    const origErr = window.console.error;
    window.console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); origErr.apply(window.console, a); };
  }
});
const { window } = dom;
const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

await wait(400);
console.log('errors:', errors);
console.log('=== attn 卡片清单 ===');
$$('#attn-list .attn').forEach((c, i) => {
  console.log('[' + i + '] class=' + c.className);
  console.log('    hd: ' + (c.querySelector('.hd') || { textContent: '' }).textContent.replace(/\s+/g, ' '));
  console.log('    msg: ' + Array.from(c.querySelectorAll('.msg')).map(m => m.textContent.replace(/\s+/g, ' ')).join(' || '));
});

// 复现：给背英语单词打卡后，休息日黄卡应消失
const rowA = $$('#today-list .goal-row').find(r => r.textContent.indexOf('背英语单词') >= 0);
click(rowA.querySelector('[data-act="checkin"]'));
await wait(200);
console.log('=== 打卡后 attn 卡片 ===');
$$('#attn-list .attn').forEach((c, i) => {
  console.log('[' + i + '] ' + c.className + ' | ' + c.textContent.replace(/\s+/g, ' ').slice(0, 90));
});

// 补记：与 smoke 第 4 步一致
const rowB = $$('#today-list .goal-row').find(r => r.textContent.indexOf('人类简史') >= 0);
rowB.querySelector('[data-f="date"]').value = back(3);
rowB.querySelector('[data-f="min"]').value = '26';
click(rowB.querySelector('[data-act="checkin"]'));
await wait(200);

console.log('\n=== 看板 ===');
const boardBtn = $$('[data-tab]').find(b => b.getAttribute('data-tab') === 'board');
if (boardBtn) click(boardBtn);
await wait(200);
console.log('#chart-tip:', JSON.stringify(($('#chart-tip') || { textContent: '(无元素)' }).textContent));
console.log('#chart svg rect 数:', $$('#chart svg rect').length);

console.log('\n=== 删除记录 ===');
const delBtn = $('#board-list .log-item .del');
console.log('delete node found:', !!delBtn);
if (delBtn) {
  const before = calls.del.length;
  click(delBtn);
  console.log('armed:', delBtn.getAttribute('data-armed'), '| 仍在文档内:', doc.contains(delBtn));
  click(delBtn);
  await wait(200);
  console.log('calls.del:', before, '->', calls.del.length);
}

console.log('\n=== 周报 ===');
const weekBtn = $$('[data-tab]').find(b => b.getAttribute('data-tab') === 'week');
if (weekBtn) click(weekBtn);
await wait(150);
const ta = $('[data-rv="keep"]');
if (ta) { ta.value = '早上通勤背单词，效率最高'; ta.dispatchEvent(new window.Event('input', { bubbles: true })); }
await wait(1200);
const gen = $('#btn-gen-report');
if (gen) click(gen);
await wait(150);
console.log('report:');
console.log(($('#report-out') || { value: '(无)' }).value);
console.log('errors:', errors);
