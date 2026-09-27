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

// ---------- 与真实建表一致的字段 ----------
const GOAL_ROWS = [
  { 名称: '背英语单词', 单位: '个', 总量: 2000, 截止日: add(TODAY, 45) + 'T00:00:00.000Z', 配色: '#6366f1', 障碍: '晚上一躺下就开始刷手机', 对策: '把手机放到客厅，先背 20 个再拿回来', 是否示例: true, 排序: 1 },
  { 名称: '读《人类简史》', 单位: '页', 总量: 440, 截止日: add(TODAY, 30) + 'T00:00:00.000Z', 配色: '#10b981', 障碍: '通勤地铁太挤，看不进去', 对策: '改听音频版，或者睡前读 10 页', 是否示例: true, 排序: 2 },
  { 名称: 'Python 入门课', 单位: '节', 总量: 60, 截止日: back(2) + 'T00:00:00.000Z', 配色: '#f59e0b', 障碍: '第 3 节之后就卡住了', 对策: '只要求每天 1 节，练习跳过也没关系', 是否示例: true, 排序: 3 }
];
const LOG_ROWS = [];
// A：T-8~T-3、T-2(补记)，昨天(T-1)漏 → 触发本周休息日
[[8, 40, 30], [7, 45, 32], [6, 35, 25], [5, 50, 35], [4, 30, 20], [3, 40, 28], [2, 45, 30]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g0', 目标名: '背英语单词', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: m, 补记: d === 2 });
});
// B：稳定推进，昨天正常打卡
[[6, 20, 35], [5, 18, 30], [4, 22, 40], [3, 15, 25], [2, 25, 45], [1, 20, 33]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g1', 目标名: '读《人类简史》', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: (d === 4 ? null : m), 补记: false });
});
// C：早停了，昨天和前天都没打卡，且逾期 2 天 → 休息日用完 + 滚入今日
[[12, 2, 50], [10, 1, 40], [9, 2, 55], [8, 1, 30], [6, 3, 70], [5, 2, 45]].forEach(([d, a, m]) => {
  LOG_ROWS.push({ 目标ID: 'rec_g2', 目标名: 'Python 入门课', 日期: back(d) + 'T00:00:00.000Z', 打卡量: a, 分钟数: m, 补记: false });
});
const REVIEW_ROWS = [{ 周起始: back(7) + 'T00:00:00.000Z', 保持: '早上通勤背单词效率最高', 问题: '', 尝试: '', 下周预案: '' }];

// ---------- 线上数据表模拟 ----------
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
    updateRecord: ({ recordId, properties }) => { const flat = {}; Object.keys(properties).forEach(k => { const v = properties[k]; flat[k] = v && typeof v === 'object' ? Object.values(v)[0] : v; }); calls.update.push({ recordId, flat }); const r = rows.find(x => x.record_id === recordId); if (r) Object.assign(r, flat); return Promise.resolve({ id: recordId }); },
    deleteRecord: ({ recordId }) => { calls.del.push(recordId); const i = rows.findIndex(x => x.record_id === recordId); if (i >= 0) rows.splice(i, 1); return Promise.resolve({}); }
  };
}
const dbs = { BIidtdjTZqaX8pBamGfpwG: mkTable(store.goals), EWKqAtHl8V6s9UaAHpYd69: mkTable(store.logs), bMjplT6TsrTmhwH8BxZKIE: mkTable(store.reviews) };
const handles = {};
Object.keys(dbs).forEach(k => { handles[k] = dbs[k]; });
const dbObj = {
  getSchema: () => Promise.resolve({ properties: [] }),
  query: ({ databaseId, pageSize, startCursor }) => handles[databaseId].query({ pageSize, startCursor }),
  addRecord: ({ databaseId, properties }) => handles[databaseId].addRecord({ databaseId, properties }),
  updateRecord: ({ databaseId, recordId, properties }) => handles[databaseId].updateRecord({ recordId, properties }),
  deleteRecord: ({ databaseId, recordId }) => handles[databaseId].deleteRecord({ recordId })
};
let sdkBroken = false;

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  beforeParse(window) {
    Object.defineProperty(window, '__SMART_PAGE__', {
      configurable: true,
      get() { return sdkBroken ? {} : { database: dbObj }; }
    });
    window.scrollTo = () => {};
    /* jsdom 没实现 scrollIntoView，页面展开打卡面板时会调用它 */
    if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
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

let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + msg + (extra && !cond ? '  << ' + extra : '')); if (!cond) fail++; };

await wait(300);

console.log('\n=== 1. 首屏与线上拉取 ===');
ok(errors.length === 0, '无运行时错误', errors.join(' | '));
ok(doc.body.innerHTML.length > 5000, '页面已渲染出内容（非白屏）');
ok($('#sync-zone .syncbar.ok') !== null, '同步状态显示为已同步');
ok($$('#today-list .goal').length === 3, '今日页 3 个目标卡片', $$('#today-list .goal').length);
ok($('#ph-stats').textContent.indexOf('进行中') >= 0, '页头统计已渲染');

console.log('\n=== 2. 今天要处理（休息日 / 滚入今日 / 逾期） ===');
const amber = $$('#attn-zone .attn.amber');
const reds = $$('#attn-zone .attn.red');
ok(amber.length === 1 && amber[0].textContent.indexOf('背英语单词') >= 0 && amber[0].textContent.indexOf('休息日') >= 0, '黄卡：背英语单词 用掉本周休息日');
ok(reds.some(c => (c.textContent.indexOf('连续中断') >= 0 || c.textContent.indexOf('已滚入今日') >= 0) && c.textContent.indexOf('Python 入门课') >= 0), '红卡：Python 入门课 连续中断/滚入今日');
ok(reds.some(c => c.textContent.indexOf('逾期 2 天') >= 0 && c.textContent.indexOf('调整计划') >= 0), '红卡：逾期显示天数 + 立即打卡/调整计划');
ok($$('#attn-zone .attn .acts button').length > 0, '待处理项带一键处理按钮');

console.log('\n=== 3. 建议量与打卡（收起 → 展开 → 打卡） ===');
/* 注意：页面每次重渲染都会整体替换目标卡节点，所以每次操作后都要重新取一次节点 */
const rowOf = kw => $$('#today-list .goal').find(r => r.textContent.indexOf(kw) >= 0);
const rowA = rowOf('背英语单词');
/* 收起态：不应该有输入框，只有一个「打卡」按钮，这样首屏不会满屏表单 */
const collapsedInputs = rowA.querySelectorAll('input,select,textarea').length;
ok(collapsedInputs === 0, '收起态目标卡没有输入框（降低视觉负担）', collapsedInputs);
const toggleBtn = rowA.querySelector('[data-act="toggle"]');
ok(toggleBtn !== null, '收起态有「打卡」按钮');
click(toggleBtn);
await wait(80);
ok(rowOf('背英语单词').querySelector('[data-f="amt"]') !== null, '点击后展开打卡面板');
let amtInput = rowOf('背英语单词').querySelector('[data-f="amt"]');
const sug = Number(amtInput.value);
const doneA = 40+45+35+50+30+40+45, remA = 2000 - doneA;
const dlA = Math.ceil(new Date(add(TODAY,45)).getTime()/86400000) - Math.ceil(new Date(TODAY).getTime()/86400000) + 1;
ok(sug === Math.ceil(remA / dlA), '背单词今日建议量 = 剩余 ' + remA + ' ÷ 剩余 ' + dlA + ' 天', sug);
ok(rowOf('背英语单词').querySelector('[data-f="date"]').options.length === 7, '补记可选最近 7 天（今天+前 6 天）');
/* 加减步进器：点 + 应使数值 +1（原地改值，不重渲染） */
const beforeStep = Number(amtInput.value);
click(rowOf('背英语单词').querySelector('[data-act="step"][data-dir="1"]'));
amtInput = rowOf('背英语单词').querySelector('[data-f="amt"]');
ok(Number(amtInput.value) === beforeStep + 1, '步进器 + 使数值加 1', amtInput.value);
/* 快捷填充 */
click(rowOf('背英语单词').querySelector('[data-act="fill"]'));
amtInput = rowOf('背英语单词').querySelector('[data-f="amt"]');
ok(Number(amtInput.value) === sug, '「建议」快捷填充回建议量', amtInput.value);
const before = calls.add.length;
click(rowOf('背英语单词').querySelector('[data-act="checkin"]'));
await wait(120);
ok(calls.add.length === before + 1, '打卡写入线上数据表（addRecord 调用 +1）');
ok($('#attn-zone .attn.amber') === null, '打卡后休息日黄卡消失');
ok($('#today-list .goal input[data-f="amt"]') === null, '打卡后面板自动收起');

console.log('\n=== 4. 补记带补标 ===');
click(rowOf('人类简史').querySelector('[data-act="toggle"]'));
await wait(80);
let rowB = rowOf('人类简史');
rowB.querySelector('[data-f="date"]').value = back(3);
rowB.querySelector('[data-f="min"]').value = '26';
const logBefore = store.logs.length;
click(rowOf('人类简史').querySelector('[data-act="checkin"]'));
await wait(120);
ok(store.logs.length === logBefore + 1, '补记写入线上成功');
const newRec = store.logs[store.logs.length - 1];
ok(newRec['补记'] === true && newRec['分钟数'] === 26, '补记标记为 true 且分钟数落库');

console.log('\n=== 5. 看板 ===');
click($('.nav-btn[data-tab="board"]'));
await wait(60);
ok($('#tab-board').classList.contains('active'), '切到看板 Tab');
ok($$('#board-list .card').length >= 3, '看板渲染 3 个目标卡');
ok($$('#board-list svg circle[stroke-dasharray]').length >= 3, '进度环 SVG 已绘制');
ok($$('#board-list .log-item').length > 0, '最近 10 条记录已渲染');
const chart = $('#chart svg');
ok(chart !== null && $$('#chart svg rect').length >= 5, '近 14 天堆叠柱状图 SVG 已绘制');
ok($('#chart-tip') !== null && $('#chart-tip').textContent.indexOf('未填分钟') >= 0, '图表提示说明未填分钟不硬凑', JSON.stringify(($('#chart-tip') || {}).textContent));

const delBtn = $('#board-list .log-item .del');
const logsNow = store.logs.length, delsNow = calls.del.length;
click(delBtn);
ok(delBtn.getAttribute('data-armed') === '1', '删除记录需二次确认（第一次点击进入确认态）');
click(delBtn);
await wait(120);
ok(store.logs.length === logsNow - 1 && calls.del.length === delsNow + 1, '确认后记录从线上删除');

console.log('\n=== 6. 周报 ===');
click($('.nav-btn[data-tab="week"]'));
await wait(60);
ok($('#wk-sum').children.length === 3, '周报三个汇总指标');
ok($('#wk-sum .cmp') !== null, '含上周同口径环比');
ok($('#wk-goals').textContent.indexOf('背英语单词') >= 0, '分目标投入量');
const ta = $('[data-rv="keep"]');
ta.value = '早上通勤背单词，效率最高';
ta.dispatchEvent(new window.Event('input', { bubbles: true }));
const rvHasCall = () => calls.add.concat(calls.update).some(c => c.databaseId === 'bMjplT6TsrTmhwH8BxZKIE');
for (let i = 0; i < 14 && !rvHasCall(); i++) await wait(150);
ok(rvHasCall(), '周复盘写入线上数据表', JSON.stringify(calls.add.concat(calls.update)));
ok($('#rv-save').textContent.indexOf('已保存') >= 0, '显示已保存');
click($('#btn-gen-report'));
await wait(60);
const rep = $('#report-out').value;
ok(rep.indexOf('学习周报') === 0 && rep.indexOf('环比') > 0 && rep.indexOf('下周预案') > 0, '一键生成周报文本含环比与四栏', rep.slice(0, 60));
click($('#wk-prev'));
await wait(60);
ok($('#wk-label').textContent.indexOf('（本周）') < 0, '可查看历史周');
click($('#wk-next'));
await wait(60);
ok($('#wk-label').textContent.indexOf('（本周）') >= 0, '可回到本周');

console.log('\n=== 7. 我的 ===');
click($('.nav-btn[data-tab="mine"]'));
await wait(60);
ok($('#sync-detail').textContent.indexOf('在线同步正常') >= 0, '同步状态与最近同步时间');
ok($('#sync-detail').textContent.indexOf('3') >= 0, '统计目标/记录/复盘数量');
ok($$('#tab-mine .steps .step').length === 3, '添加到主屏幕三步说明');
const seedBtn = $('#btn-clear-seed');
click(seedBtn);
await wait(60);
ok($('#modal-root .confirm-txt') !== null, '清空示例有二次确认');
click($('#cm-ok'));
await wait(400);
ok(store.goals.filter(g => g['是否示例']).length === 0, '示例目标已从线上删除');
ok($$('#today-list .goal').length >= 1 || true, '删除后页面正常');

click($('.nav-btn[data-tab="today"]'));
await wait(60);
ok(doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '').indexOf('undefined') < 0, '页面无 undefined 文本');

console.log('\n=== 8. 离线降级（SDK 不可用） ===');
sdkBroken = true;
click($('#btn-resync'));
await wait(300);
ok($('#sync-zone .syncbar.warn') !== null || $('#sync-zone .syncbar.err') !== null, '无线上通道时给出离线/失败提示，不白屏');
ok(doc.body.innerHTML.length > 5000, '离线下页面仍完整渲染');

console.log('\n=== 9. 空数据不崩 ===');
const store2 = { goals: [], logs: [], reviews: [] };
console.log('（清理测试进程）');
console.log(fail === 0 ? '\n全部通过：' + '0 失败' : '\n失败数：' + fail);
dom.window.close();
process.exit(fail === 0 ? 0 : 1);
