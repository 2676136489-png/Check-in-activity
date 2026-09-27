import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/111/.workbuddy/binaries/node/workspace/');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(new URL('../学习目标管理台.html', import.meta.url), 'utf8');
const T = new Date();
const p = n => (n < 10 ? '0' + n : '' + n);
const ds = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const add = (s, n) => { const [y, m, d] = s.split('-').map(Number); const dd = new Date(y, m - 1, d); dd.setDate(dd.getDate() + n); return ds(dd); };
const TODAY = ds(T), back = n => add(TODAY, -n);

const GOAL_ROWS = [
  { 名称: '背英语单词', 单位: '个', 总量: 2000, 截止日: add(TODAY, 45) + 'T00:00:00.000Z', 配色: '#6366f1', 障碍: 'x', 对策: 'y', 是否示例: true, 排序: 1 },
  { 名称: '读《人类简史》', 单位: '页', 总量: 440, 截止日: add(TODAY, 30) + 'T00:00:00.000Z', 配色: '#10b981', 障碍: '', 对策: '', 是否示例: true, 排序: 2 },
  { 名称: 'Python 入门课', 单位: '节', 总量: 60, 截止日: back(2) + 'T00:00:00.000Z', 配色: '#f59e0b', 障碍: '', 对策: '', 是否示例: true, 排序: 3 }
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
const REVIEW_ROWS = [{ 周起始: back(7) + 'T00:00:00.000Z', 保持: '', 问题: '', 尝试: '', 下周预案: '' }];

const store = { goals: GOAL_ROWS.map((r, i) => ({ record_id: 'rec_g' + i, ...r })), logs: LOG_ROWS.map((r, i) => ({ record_id: 'rec_l' + i, ...r })), reviews: REVIEW_ROWS.map((r, i) => ({ record_id: 'rec_r' + i, ...r })) };
const calls = { add: [], update: [], del: [] };
let seq = 100;
function flat(properties) { const o = {}; Object.keys(properties).forEach(k => { const v = properties[k]; o[k] = v && typeof v === 'object' ? Object.values(v)[0] : v; }); return o; }
function mkTable(rows) {
  return {
    query: ({ pageSize = 200, startCursor }) => {
      const start = startCursor ? Number(String(startCursor).split('_')[1]) : 0;
      const page = rows.slice(start, start + pageSize).map(r => ({ ...r }));
      const next = start + pageSize < rows.length ? 'c_' + (start + pageSize) : null;
      return Promise.resolve({ results: page, hasMore: !!next, nextCursor: next });
    },
    addRecord: ({ databaseId, properties }) => { if (!databaseId) throw new Error('addRecord 缺 databaseId'); calls.add.push({ databaseId, flat: flat(properties) }); const id = 'new' + (++seq); rows.push({ record_id: id, ...flat(properties) }); return Promise.resolve({ id }); },
    updateRecord: ({ recordId, properties }) => { if (!recordId) return Promise.reject(new Error('updateRecord 缺 recordId')); calls.update.push({ recordId, flat: flat(properties) }); const r = rows.find(x => x.record_id === recordId); if (r) Object.assign(r, flat(properties)); return Promise.resolve({ id: recordId }); },
    deleteRecord: ({ recordId }) => { if (!recordId) return Promise.reject(new Error('deleteRecord 缺 recordId')); calls.del.push(recordId); const i = rows.findIndex(x => x.record_id === recordId); if (i >= 0) rows.splice(i, 1); return Promise.resolve({}); }
  };
}
const dbs = { BIidtdjTZqaX8pBamGfpwG: mkTable(store.goals), EWKqAtHl8V6s9UaAHpYd69: mkTable(store.logs), bMjplT6TsrTmhwH8BxZKIE: mkTable(store.reviews) };
const handles = {}; Object.keys(dbs).forEach(k => { handles[k] = dbs[k]; });
const dbObj = {
  getSchema: () => Promise.resolve({ properties: [] }),
  query: ({ databaseId, pageSize, startCursor }) => handles[databaseId].query({ pageSize, startCursor }),
  addRecord: ({ databaseId, properties }) => handles[databaseId].addRecord({ databaseId, properties }),
  updateRecord: ({ databaseId, recordId, properties }) => handles[databaseId].updateRecord({ recordId, properties }),
  deleteRecord: ({ databaseId, recordId }) => handles[databaseId].deleteRecord({ recordId })
};

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/',
  beforeParse(window) {
    Object.defineProperty(window, '__SMART_PAGE__', { configurable: true, get: () => ({ database: dbObj }) });
    window.scrollTo = () => {};
    window.addEventListener('error', e => errors.push('window.error: ' + ((e.error && e.error.stack) || e.message)));
    const oe = window.console.error; window.console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); oe.apply(window.console, a); };
  }
});
const { window } = dom, doc = window.document;
const $ = s => doc.querySelector(s), $$ = s => Array.from(doc.querySelectorAll(s));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(300);

console.log('--- 进入周报 tab ---');
click($('.nav-btn[data-tab="week"]'));
await wait(80);
const ta = $('[data-rv="keep"]');
console.log('textarea 存在:', !!ta);
ta.value = '早上通勤背单词，效率最高';
ta.dispatchEvent(new window.Event('input', { bubbles: true }));
for (let i = 0; i < 12; i++) {
  await wait(150);
  if (calls.add.some(c => c.databaseId === 'bMjplT6TsrTmhwH8BxZKIE') || calls.update.some(c => c.flat && c.databaseId === 'x')) break;
}
console.log('add 调用:', JSON.stringify(calls.add, null, 1));
console.log('update 调用:', JSON.stringify(calls.update, null, 1));
console.log('rv-save:', JSON.stringify($('#rv-save') ? $('#rv-save').textContent : null));
console.log('store.reviews 条数:', store.reviews.length, JSON.stringify(store.reviews));
click($('#btn-gen-report'));
await wait(60);
const rep = $('#report-out').value;
console.log('--- 报告前 400 字 ---\n' + rep.slice(0, 400));
console.log('报错:', errors.join(' | ') || '无');
dom.window.close();
process.exit(0);
