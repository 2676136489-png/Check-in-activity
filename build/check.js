
(function () {
'use strict';

/* =======================================================================
   0. 常量与工具
   ======================================================================= */
var DB_GOALS    = 'BIidtdjTZqaX8pBamGfpwG';  /* 学习目标 */
var DB_LOGS     = 'EWKqAtHl8V6s9UaAHpYd69';  /* 每日打卡记录 */
var DB_REVIEWS  = 'bMjplT6TsrTmhwH8BxZKIE';  /* 每周复盘 */
var LS_KEY      = 'wb_learngoal_v1';
var CACHE_DTS   = 'wb_learngoal_cache_ts';

var COLORS = ['#6366f1','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#ef4444','#f97316','#14b8a6'];

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
function todayStr() { return ds(new Date()); }
function addDays(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
function diffDays(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
function mondayOf(s) { var d = pd(s); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ds(d); }
function dayCN(s) { return '日一二三四五六'.charAt(pd(s).getDay()); }
function mdShort(s) { var p = String(s).slice(0, 10).split('-'); return (+p[1]) + '/' + (+p[2]); }
function mdCN(s) { var p = String(s).slice(0, 10).split('-'); return (+p[1]) + '月' + (+p[2]) + '日'; }
function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
function nfmt(n) { n = Number(n) || 0; return (Math.round(n * 10) / 10).toString(); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* =======================================================================
   1. 状态
   ======================================================================= */
var S = { goals: [], logs: [], reviews: [] };
var SYNC = { status: 'loading', last: '', msg: '', offline: false };
var VIEW = { tab: 'today', week: mondayOf(todayStr()) };
var ROLLING = { processing: false };

function goalById(id) { for (var i = 0; i < S.goals.length; i++) { if (S.goals[i].id === id) return S.goals[i]; } return null; }
function logsOf(id) { return S.logs.filter(function (l) { return l.goalId === id; }); }
function goalDone(goal) { var t = 0; S.logs.forEach(function (l) { if (l.goalId === goal.id) t += (Number(l.amount) || 0); }); return t; }

/* =======================================================================
   2. 数据层（唯一读写入口）
   ======================================================================= */
function DB() { try { return (window.__SMART_PAGE__ && window.__SMART_PAGE__.database) || null; } catch (e) { return null; } }

function qAll(dbId, pageFn) {
  /* 分页拉取全部记录；三重保护防止死循环 */
  return new Promise(function (resolve, reject) {
    var acc = [], cursor, guard = 0;
    function step(pageSize, startCursor) {
      if (++guard > 200) { resolve(acc); return; }
      var p = { databaseId: dbId, pageSize: pageSize || 200, startCursor: startCursor };
      pageFn(p).then(function (res) {
        acc = acc.concat((res && res.results) || []);
        var next = res && res.nextCursor;
        if (res && res.hasMore && next && next !== startCursor && ((res.results || []).length > 0)) step(200, next);
        else resolve(acc);
      }).catch(reject);
    }
    step(200, undefined);
  });
}

function pullAll() {
  var db = DB();
  if (!db) return Promise.reject(new Error('no-sdk'));
  function q(id) { return function (p) { return db.query(p); }; }
  return Promise.all([
    qAll(DB_GOALS, q()).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: (r.record_id || r.id || uid()),
          name: r['名称'] || '', unit: r['单位'] || '',
          total: Number(r['总量']) || 0,
          due: String(r['截止日'] || '').slice(0, 10),
          color: r['配色'] || COLORS[0],
          blocker: r['障碍'] || '', counter: r['对策'] || '',
          seed: !!r['是否示例'], sort: Number(r['排序']) || 0
        };
      });
    }),
    qAll(DB_LOGS, q()).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: (r.record_id || r.id || uid()),
          goalId: r['目标ID'] || '', goalName: r['目标名'] || '',
          date: String(r['日期'] || '').slice(0, 10) || todayStr(),
          amount: Number(r['打卡量']) || 0,
          minutes: (r['分钟数'] == null || r['分钟数'] === '') ? null : (Number(r['分钟数']) || null),
          makeup: !!r['补记']
        };
      });
    }),
    qAll(DB_REVIEWS, q()).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: (r.record_id || r.id || uid()),
          week: String(r['周起始'] || '').slice(0, 10),
          keep: r['保持'] || '', issue: r['问题'] || '', tryIt: r['尝试'] || '', plan: r['下周预案'] || ''
        };
      });
    })
  ]).then(function (out) {
    S.goals = out[0]; S.logs = out[1]; S.reviews = out[2];
    sortState(); saveCache();
  });
}

function sortState() {
  S.goals.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
  S.logs.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
}

/* ---- 缓存（离线兜底，绝不丢数据） ---- */
function saveCache() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, goals: S.goals, logs: S.logs, reviews: S.reviews }));
    localStorage.setItem(CACHE_DTS, new Date().toISOString());
  } catch (e) { /* 隐私模式下忽略 */ }
}
function loadCache() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (!d || !d.goals) return false;
    S.goals = d.goals || []; S.logs = d.logs || []; S.reviews = d.reviews || [];
    sortState(); return true;
  } catch (e) { return false; }
}

/* ---- 远场写入 ---- */
function wpGoals(props) { return { databaseId: DB_GOALS, properties: props }; }
function wpLogs(props) { return { databaseId: DB_LOGS, properties: props }; }
function wpReviews(props) { return { databaseId: DB_REVIEWS, properties: props }; }

function goalProps(g) {
  return { '名称': { text: g.name }, '单位': { text: g.unit }, '总量': { number: g.total },
           '截止日': { date: g.due + 'T00:00:00.000Z' }, '配色': { text: g.color },
           '障碍': { text: g.blocker }, '对策': { text: g.counter },
           '是否示例': { checkbox: !!g.seed }, '排序': { number: g.sort || 0 } };
}
function logProps(l, g) {
  return { '目标ID': { text: l.goalId }, '目标名': { text: (g && g.name) || l.goalName || '' },
           '日期': { date: l.date + 'T00:00:00.000Z' }, '打卡量': { number: l.amount },
           '分钟数': { number: (l.minutes == null ? 0 : l.minutes) },
           '补记': { checkbox: !!l.makeup } };
}
function reviewProps(r) {
  return { '周起始': { date: r.week + 'T00:00:00.000Z' }, '保持': { text: r.keep || '' },
           '问题': { text: r.issue || '' }, '尝试': { text: r.tryIt || '' }, '下周预案': { text: r.plan || '' } };
}

function api() { return DB(); }

/* =======================================================================
   3. 业务动作（先落云端，成功后才更新本地态）
   ======================================================================= */
function actAddGoal(g) {
  var db = api(); if (!db) return Promise.reject(new Error('离线'));
  return db.addRecord(wpGoals(goalProps(g))).then(function (res) {
    g.id = (res && (res.id || res.record_id)) || uid();
    S.goals.push(g); sortState(); saveCache(); return g;
  });
}
function actUpdateGoal(g) {
  var db = api(); if (!db) return Promise.reject(new Error('离线'));
  var id = (g.__rid || g.id);
  return db.updateRecord({ databaseId: DB_GOALS, recordId: id, properties: goalProps(g) }).then(function () {
    saveCache(); return g;
  });
}
function actDeleteGoal(gid) {
  var db = api();
  var goal = goalById(gid); var rid = goal && (goal.__rid || goal.id);
  var logs = S.logs.filter(function (l) { return l.goalId === gid; });
  var chain = Promise.resolve();
  if (rid && db) chain = chain.then(function () { return db.deleteRecord({ databaseId: DB_GOALS, recordId: rid }); });
  logs.forEach(function (l) { if (l.__rid && db) { (function (r) { chain = chain.then(function () { return db.deleteRecord({ databaseId: DB_LOGS, recordId: r }); }); })(l.__rid); } });
  return chain.then(function () {
    S.goals = S.goals.filter(function (x) { return x.id !== gid; });
    S.logs = S.logs.filter(function (l) { return l.goalId !== gid; });
    saveCache();
  });
}
function actAddLog(l) {
  var db = api(); if (!db) return Promise.reject(new Error('离线'));
  return db.addRecord(wpLogs(logProps(l, goalById(l.goalId)))).then(function (res) {
    l.__rid = (res && (res.id || res.record_id)) || uid();
    S.logs.push(l); saveCache(); return l;
  });
}
function actDeleteLog(lid) {
  var db = api(); var l = null;
  for (var i = 0; i < S.logs.length; i++) { if (S.logs[i].id === lid) { l = S.logs[i]; break; } }
  var rid = l && (l.__rid || l.id);
  var chain = (rid && db) ? db.deleteRecord({ databaseId: DB_LOGS, recordId: rid }) : Promise.resolve();
  return chain.then(function () { S.logs = S.logs.filter(function (x) { return x.id !== lid; }); saveCache(); });
}
function actSaveReview(r) {
  var db = api(); if (!db) return Promise.reject(new Error('离线'));
  if (r.__rid) {
    return db.updateRecord({ databaseId: DB_REVIEWS, recordId: r.__rid, properties: reviewProps(r) }).then(function () { saveCache(); return r; });
  }
  return db.addRecord(wpReviews(reviewProps(r))).then(function (res) {
    r.__rid = (res && (res.id || res.record_id)) || uid();
    var found = false;
    for (var i = 0; i < S.reviews.length; i++) { if (S.reviews[i].week === r.week) { S.reviews[i] = r; found = true; break; } }
    if (!found) S.reviews.push(r);
    saveCache(); return r;
  });
}
function actDeleteReview(rid) {
  var db = api();
  return (db ? db.deleteRecord({ databaseId: DB_REVIEWS, recordId: rid }) : Promise.resolve()).then(function () {
    S.reviews = S.reviews.filter(function (r) { return !(r.id === rid); }); saveCache();
  });
}

/* =======================================================================
   4. 反馈：提示条 / 弹窗 / 彩带
   ======================================================================= */
var toastTimer = null;
function toast(msg, kind) {
  var old = document.querySelector('.toast'); if (old && old.parentNode) old.parentNode.removeChild(old);
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : ''); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
}

function closeModal() { var r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; }
function openModal(html) {
  var r = document.getElementById('modal-root');
  r.innerHTML = '<div class="mask" data-mask="1"><div class="modal">' + html + '</div></div>';
  var mask = r.querySelector('.mask');
  mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  var btn = r.querySelector('[data-close]'); if (btn) btn.addEventListener('click', closeModal);
  var first = r.querySelector('input,textarea,select'); if (first && window.requestAnimationFrame) window.requestAnimationFrame(function () { try { first.focus(); } catch (e) {} });
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

function confirmModal(opts) {
  openModal(
    '<h3>' + esc(opts.title) + '</h3>' +
    (opts.warn ? '<div class="confirm-txt">' + opts.warn + '</div>' : '') +
    '<div class="sub">' + esc(opts.desc || '') + '</div>' +
    (opts.input ? '<div class="fld" style="margin-bottom:12px"><label>' + esc(opts.inputLabel || '确认输入') + '</label><input id="cm-in" type="text" placeholder="' + esc(opts.inputPlaceholder || '') + '" autocomplete="off"></div>' : '') +
    '<div class="modal-acts"><button class="btn btn-ghost" data-close type="button">取消</button>' +
    '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" id="cm-ok" type="button">' + esc(opts.okText || '确定') + '</button></div>'
  );
  var ok = document.getElementById('cm-ok');
  ok.addEventListener('click', function () {
    var v = '';
    var inp = document.getElementById('cm-in');
    if (inp) v = (inp.value || '').trim();
    if (opts.input && v !== opts.input) { toast('输入不匹配，未执行', 'err'); return; }
    closeModal(); if (opts.onOk) opts.onOk();
  });
}

function confetti() {
  var box = document.getElementById('confetti');
  if (!box) return;
  var colors = ['#4f46e5', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#9333ea'];
  for (var i = 0; i < 70; i++) {
    (function (i) {
      var d = document.createElement('i');
      d.className = 'cf';
      d.style.left = (Math.random() * 100) + '%';
      d.style.background = colors[i % colors.length];
      d.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
      d.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      d.style.animation = 'cfFall ' + (1.7 + Math.random() * 1.3) + 's cubic-bezier(.25,.6,.4,1) ' + (Math.random() * .35) + 's forwards';
      d.style.width = (6 + Math.random() * 7) + 'px';
      d.style.height = (10 + Math.random() * 10) + 'px';
      box.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3600);
    })(i);
  }
}

/* =======================================================================
   5. 计算层（纯函数，只读状态、不改状态）
   ======================================================================= */
function remainOf(goal) { return Math.max(0, (Number(goal.total) || 0) - goalDone(goal)); }
function isDone(goal) { return (Number(goal.total) || 0) > 0 && goalDone(goal) >= (Number(goal.total) || 0); }
function pctOf(goal) { if (!(Number(goal.total) > 0)) return 0; return clamp(goalDone(goal) / goal.total * 100, 0, 100); }
function overdueDays(goal) { var d = diffDays(todayStr(), goal.due); return d < 0 ? -d : 0; }
function daysLeftOf(goal) { return diffDays(todayStr(), goal.due); }        /* 距截止日还剩几天（不含今天） */
function suggestOf(goal) {
  var rem = remainOf(goal);
  if (rem <= 0) return 0;
  var dl = daysLeftOf(goal);
  if (dl < 0) return Math.ceil(rem);
  return Math.max(1, Math.ceil(rem / (dl + 1)));
}
function dateSetOf(goal) {
  var m = {};
  for (var i = 0; i < S.logs.length; i++) {
    var l = S.logs[i];
    if (l.goalId === goal.id && (Number(l.amount) || 0) > 0) m[l.date] = 1;
  }
  return m;
}
function firstLogDate(goal) {
  var best = '';
  for (var i = 0; i < S.logs.length; i++) { if (S.logs[i].goalId === goal.id && S.logs[i].date < best) best = S.logs[i].date; }
  return best;
}
function computeStreak(goal) {
  var m = dateSetOf(goal), t = todayStr();
  var starts = firstLogDate(goal) || t;
  var cur = m[t] ? t : addDays(t, -1);
  var streak = 0, used = {}, guard = 0;
  while (guard++ < 500) {
    if (cur < starts) break;
    if (m[cur]) { streak++; }
    else {
      var wk = mondayOf(cur);
      if (!used[wk]) { used[wk] = true; }   /* 本周第一次漏：用掉休息日，不中断 */
      else break;
    }
    cur = addDays(cur, -1);
  }
  return streak;
}
function yesterdayState(goal) {
  var y = addDays(todayStr(), -1), m = dateSetOf(goal);
  if (m[y]) return 'ok';
  if (isDone(goal)) return 'done';
  var wk = mondayOf(y), d = wk, missBefore = 0, starts = firstLogDate(goal) || y;
  while (d < y) {
    if (d >= starts && !m[d]) missBefore++;
    d = addDays(d, 1);
  }
  return missBefore === 0 ? 'rest' : 'broken';
}
function restUsedThisWeek(goal) {
  var m = dateSetOf(goal), t = todayStr(), wk = mondayOf(t), miss = 0, d = wk;
  while (d <= t) {
    if (d !== t && !m[d] && d >= (firstLogDate(goal) || d)) miss++;
    d = addDays(d, 1);
  }
  return miss;
}
function etaOf(goal) {
  var rem = remainOf(goal);
  if (rem <= 0) return { state: 'done' };
  var t = todayStr(), sum = 0, days = 0, i, j;
  for (i = 0; i < 7; i++) {
    var d = addDays(t, -i), amt = 0, has = false;
    for (j = 0; j < S.logs.length; j++) {
      var l = S.logs[j];
      if (l.goalId === goal.id && l.date === d) { amt += (Number(l.amount) || 0); has = true; }
    }
    if (has && amt > 0) { sum += amt; days++; }
  }
  if (days < 3 || sum <= 0) return { state: 'none' };   /* 样本不足，绝不编数字 */
  var avg = sum / 7;
  var need = Math.ceil(rem / avg);
  if (!(need > 0) || need > 3650) return { state: 'none' };
  var eta = addDays(t, need);
  return { state: 'ok', eta: eta, need: need, diff: diffDays(eta, goal.due) };
}
function etaText(goal) {
  var e = etaOf(goal);
  if (e.state === 'done') return { v: '已完成', cls: 'g' };
  if (e.state === 'none') return { v: '暂无推算', cls: 'm' };
  var tail = e.diff > 0 ? ('提前 ' + e.diff + ' 天') : (e.diff < 0 ? ('拖后 ' + (-e.diff) + ' 天') : '正好赶上');
  return { v: mdShort(e.eta), cls: e.diff >= 0 ? 'g' : 'r', sub: tail, eta: e.eta };
}
function todayAmount(goal) {
  var t = todayStr(), s = 0;
  for (var i = 0; i < S.logs.length; i++) { var l = S.logs[i]; if (l.goalId === goal.id && l.date === t) s += (Number(l.amount) || 0); }
  return s;
}
function goalRank(goal) {
  var st = yesterdayState(goal);
  if (st === 'broken' || st === 'rest') return 0;
  if (overdueDays(goal) > 0 && !isDone(goal)) return 1;
  if (isDone(goal)) return 3;
  return 2;
}
function sortedGoals() {
  return S.goals.slice().sort(function (a, b) {
    var ra = goalRank(a), rb = goalRank(b);
    if (ra !== rb) return ra - rb;
    return (a.sort || 0) - (b.sort || 0);
  });
}

/* =======================================================================
   6. SVG 图标
   ======================================================================= */
function ic(name, size, sw) {
  var s = size || 16, w = sw || 2;
  var P = {
    edit: '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/><path d="M13.5 6.5 17.5 10.5"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5.5M12 17.2h.01"/>',
    coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.6a2.4 2.4 0 0 1 0 4.8H17"/><path d="M7 3v2M11 3v2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
    bolt: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>'
  };
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
}

/* =======================================================================
   7. 渲染层：同步条
   ======================================================================= */
function renderSync() {
  var zone = document.getElementById('sync-zone'); if (!zone) return;
  var cfg = {
    loading: { cls: 'warn', dot: ' pulse', ico: ic('refresh', 15), txt: '正在从线上读取学习数据…' },
    ok:      { cls: 'ok',   dot: '',        ico: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>', txt: '已同步 · 数据存在资料库云端，多设备自动同步' },
    offline: { cls: 'warn', dot: ' pulse', ico: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-6-3"/></svg>', txt: '离线模式 · 已用本机缓存，改的东西先存本地' },
    error:   { cls: 'err',  dot: ' pulse', ico: ic('warn', 15), txt: '读取线上数据失败，当前显示的是本机缓存' }
  };
  var c = cfg[SYNC.status] || cfg.loading;
  var lastTxt = SYNC.last ? ('上次同步 ' + SYNC.last) : '';
  zone.innerHTML =
    '<div class="syncbar ' + c.cls + '"><span class="dot-state' + c.dot + '"></span>' + c.ico +
    '<span class="sp">' + esc(c.txt) + (lastTxt ? '（' + esc(lastTxt) + '）' : '') + '</span>' +
    (SYNC.status === 'ok' ? '' : '<button class="btn btn-sm btn-ghost" data-act="resync" type="button">' + ic('refresh', 14) + '重试</button>') +
    '</div>';
}

/* =======================================================================
   8. 渲染层：今日
   ======================================================================= */
function dateOptionsHTML(goal) {
  var t = todayStr(), out = '';
  for (var i = 0; i <= 6; i++) {
    var d = addDays(t, -i);
    var lb = i === 0 ? '今天' : (i === 1 ? '昨天（补记）' : mdShort(d) + '（补记）');
    out += '<option value="' + d + '">' + lb + '</option>';
  }
  return out;
}

function overdueCardHTML(goal, od) {
  return '<div class="attn red"><span style="color:var(--red);flex:none">' + ic('warn', 19) + '</span><div class="body">' +
    '<div class="hd"><span class="nm">' + esc(goal.name) + '</span><span class="badge badge-red">逾期 ' + od + ' 天</span>' +
    '<span class="pill">还剩 ' + nfmt(remainOf(goal)) + ' ' + esc(goal.unit || '') + '</span></div>' +
    '<div class="msg">截止日 ' + mdCN(goal.due) + ' 已经过去 ' + od + ' 天，未完成的量不会自动消失——要么今天补上，要么把计划改成你真能做到的样子。</div>' +
    (goal.blocker ? '<div class="msg" style="margin-top:4px">你写的障碍：' + esc(goal.blocker) + '</div>' : '') +
    (goal.counter ? '<div class="msg">对策：' + esc(goal.counter) + '</div>' : '') +
    '<div class="acts"><button class="btn btn-primary btn-sm" data-act="focus" data-id="' + esc(goal.id) + '" type="button">' + ic('check', 15) + '立即打卡</button>' +
    '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + esc(goal.id) + '" type="button">' + ic('edit', 15) + '调整计划</button></div>' +
    '</div></div>';
}
function restCardHTML(goal) {
  return '<div class="attn amber"><span style="color:var(--amber);flex:none">' + ic('coffee', 19) + '</span><div class="body">' +
    '<div class="hd"><span class="nm">' + esc(goal.name) + '</span><span class="badge badge-amber">本周休息日</span>' +
    '<span class="pill">连续 ' + computeStreak(goal) + ' 天 · 未中断</span></div>' +
    '<div class="msg">昨天没打卡，已自动用掉本周（周一起算）的 1 个休息日，连续天数没有断。本周还剩 ' + Math.max(0, 1 - restUsedThisWeek(goal)) + ' 个休息日。</div>' +
    '<div class="acts"><button class="btn btn-primary btn-sm" data-act="focus" data-id="' + esc(goal.id) + '" type="button">' + ic('check', 15) + '今天补上</button></div>' +
    '</div></div>';
}
function brokenCardHTML(goal) {
  return '<div class="attn red"><span style="color:var(--red);flex:none">' + ic('warn', 19) + '</span><div class="body">' +
    '<div class="hd"><span class="nm">' + esc(goal.name) + '</span><span class="badge badge-red">已滚入今日</span>' +
    '<span class="pill">今日建议 ' + nfmt(suggestOf(goal)) + ' ' + esc(goal.unit || '') + '</span></div>' +
    '<div class="msg">本周（周一起算）的休息日已经用掉了，昨天再漏一次，连续天数从今天重新算。昨天没做的量已经摊进今天的建议里：今天 ' + nfmt(suggestOf(goal)) + ' ' + esc(goal.unit || '') + '。</div>' +
    (goal.counter ? '<div class="msg" style="margin-top:4px">你写的对策：' + esc(goal.counter) + '</div>' : '') +
    '<div class="acts"><button class="btn btn-primary btn-sm" data-act="focus" data-id="' + esc(goal.id) + '" type="button">' + ic('check', 15) + '立即打卡</button>' +
    '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + esc(goal.id) + '" type="button">' + ic('edit', 15) + '调整计划</button></div>' +
    '</div></div>';
}
/* 同一目标可能同时逾期 + 昨日漏打，两张卡都出 */
function attnCardsOf(goal) {
  var out = [], od = overdueDays(goal), st = yesterdayState(goal);
  if (isDone(goal)) return out;
  if (od > 0) out.push(overdueCardHTML(goal, od));
  if (st === 'rest') out.push(restCardHTML(goal));
  else if (st === 'broken') out.push(brokenCardHTML(goal));
  return out;
}

function goalRowHTML(goal) {
  var done = isDone(goal), pct = pctOf(goal), sug = suggestOf(goal);
  var ta = todayAmount(goal);
  var st = computeStreak(goal), et = etaText(goal);
  var od = overdueDays(goal);
  return '<div class="goal-row' + (done ? ' done' : '') + '" id="row-' + esc(goal.id) + '">' +
    '<div class="gr-top"><span class="gr-bar" style="background:' + esc(goal.color || COLORS[0]) + '"></span>' +
    '<div class="gr-main">' +
      '<div class="gr-name">' + esc(goal.name) +
        (goal.seed ? '<span class="tag-seed">示例</span>' : '') +
        (done ? '<span class="badge" style="background:var(--green);color:#fff">已达成</span>' : '') +
      '</div>' +
      '<div class="gr-sub">目标 ' + nfmt(goal.total) + ' ' + esc(goal.unit || '') + ' · 截止 ' + mdCN(goal.due) +
        (od > 0 && !done ? ' · <span style="color:var(--red);font-weight:700">已逾期 ' + od + ' 天</span>' : '') + '</div>' +
    '</div>' +
    '<div class="gr-acts">' +
      '<button class="icon-btn" data-act="edit" data-id="' + esc(goal.id) + '" type="button" aria-label="编辑">' + ic('edit', 17) + '</button>' +
      '<button class="icon-btn" data-act="del" data-id="' + esc(goal.id) + '" type="button" aria-label="删除" style="color:var(--ink-3)">' + ic('trash', 17) + '</button>' +
    '</div></div>' +

    '<div class="gr-progress"><div class="pbar"><i style="width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,' + esc(goal.color || COLORS[0]) + ',' + esc(goal.color || COLORS[0]) + 'cc)"></i></div>' +
    '<div class="gr-stats">' +
      '<span>完成率 <b class="num">' + pct.toFixed(0) + '%</b></span>' +
      '<span>连续 <b class="num">' + st + '</b> 天</span>' +
      '<span>预计完成 <b class="' + et.cls + '">' + esc(et.v) + '</b>' + (et.sub ? '（' + esc(et.sub) + '）' : '') + '</span>' +
      '<span>剩余 <b class="num">' + nfmt(remainOf(goal)) + '</b> ' + esc(goal.unit || '') + '</span>' +
    '</div></div>' +

    ((goal.blocker || goal.counter) ? '<div class="gr-plan"><span class="k">最容易拦住我的：</span>' + esc(goal.blocker || '未填写') +
      '<br><span class="k">如果它出现，我就：</span>' + esc(goal.counter || '未填写') + '</div>' : '') +

    (done ? '<div class="gr-log" style="color:var(--green);font-weight:700">' + ic('check', 15) + ' 目标已达成，' + nfmt(goalDone(goal)) + ' ' + esc(goal.unit || '') + ' 全部完成</div>'
      : '<div class="gr-checkin">' +
        '<div class="fld"><label>完成量（建议 ' + nfmt(sug) + '）</label><input class="fld-amt num" type="number" inputmode="decimal" min="0" step="any" data-f="amt" data-id="' + esc(goal.id) + '" value="' + nfmt(sug) + '"></div>' +
        '<div class="fld"><label>分钟（选填）</label><input class="fld-min num" type="number" inputmode="numeric" min="0" step="1" data-f="min" data-id="' + esc(goal.id) + '" placeholder="—"></div>' +
        '<div class="fld"><label>记到哪天</label><select data-f="date" data-id="' + esc(goal.id) + '">' + dateOptionsHTML(goal) + '</select></div>' +
        '<button class="btn btn-primary btn-sm go" data-act="checkin" data-id="' + esc(goal.id) + '" type="button">' + ic('check', 15) + '打卡</button>' +
        '</div>' +
        '<div class="gr-log">' +
          (ta > 0 ? '<span style="color:var(--green);font-weight:700">今天已记 ' + nfmt(ta) + ' ' + esc(goal.unit || '') + '</span>' : '<span>今天还没记录，可多次打卡</span>') +
          '<span>·</span><span>建议量 = 剩余 ' + nfmt(remainOf(goal)) + ' ÷ 剩余 ' + Math.max(1, daysLeftOf(goal) + 1) + ' 天</span>' +
        '</div>') +
  '</div>';
}

function renderToday() {
  var t = todayStr();
  var dEl = document.getElementById('attn-date');
  if (dEl) dEl.textContent = mdCN(t) + ' 周' + dayCN(t);

  var attns = '', n = 0;
  sortedGoals().forEach(function (g) {
    var cards = attnCardsOf(g);
    if (cards.length) { n++; cards.forEach(function (h) { attns += h; }); }
  });
  var al = document.getElementById('attn-list');
  if (al) {
    al.innerHTML = attns ||
      '<div class="empty-ok">' + ic('check', 18) + ' 昨天都跟上了，今天也没有逾期或漏打的目标</div>';
  }
  var attnCard = document.getElementById('attn-card');
  if (attnCard) attnCard.style.display = (n > 0) ? '' : 'none';

  var list = document.getElementById('today-list');
  if (list) {
    list.innerHTML = S.goals.length ? sortedGoals().map(goalRowHTML).join('')
      : '<div class="card" style="text-align:center;padding:34px 18px">' +
        '<div style="font-size:32px;color:#c7cad8;margin-bottom:8px">' + ic('target', 34, 1.6) + '</div>' +
        '<div style="font-weight:800;margin-bottom:4px">还没有目标</div>' +
        '<div class="muted">先加一个「有终点、有总量」的目标，比如背完 2000 个单词、读完 440 页的书。</div></div>';
  }
  var sumEl = document.getElementById('today-sum');
  if (sumEl) {
    var pending = 0, overdue = 0;
    S.goals.forEach(function (g) { if (!isDone(g)) { pending++; if (overdueDays(g) > 0) overdue++; } });
    sumEl.textContent = S.goals.length ? (pending + ' 个进行中' + (overdue ? (' · ' + overdue + ' 个逾期') : '')) : '';
  }
  var badge = document.getElementById('badge-today');
  if (badge) {
    var cnt = 0; S.goals.forEach(function (g) { var s = yesterdayState(g); if (s === 'rest' || s === 'broken' || overdueDays(g) > 0) cnt++; });
    badge.textContent = cnt > 0 ? String(cnt) : '';
    badge.className = 'nav-badge' + (cnt > 0 ? '' : ' hide');
  }
  renderHero();
}

function renderHero() {
  var chip = document.getElementById('hero-chips'); if (!chip) return;
  var doing = 0, doneN = 0, streakMax = 0;
  S.goals.forEach(function (g) { if (isDone(g)) doneN++; else doing++; streakMax = Math.max(streakMax, computeStreak(g)); });
  chip.innerHTML =
    '<span class="chip">' + ic('target', 14) + '进行中 <b>' + doing + '</b></span>' +
    '<span class="chip">' + ic('check', 14) + '已达成 <b>' + doneN + '</b></span>' +
    '<span class="chip">' + ic('bolt', 14) + '最长连续 <b>' + streakMax + '</b> 天</span>';
}

/* =======================================================================
   9. 渲染层：看板
   ======================================================================= */
function ringSVG(pct, color) {
  var r = 38, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 100) / 100);
  return '<svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">' +
    '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="#eef0f7" stroke-width="9"/>' +
    '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 46 46)"/></svg>';
}

function boardCardHTML(goal) {
  var pct = pctOf(goal), et = etaText(goal), st = computeStreak(goal), done = isDone(goal);
  var recs = logsOf(goal.id).slice(0, 10);
  var recHTML = recs.length ? recs.map(function (l) {
    return '<div class="log-item">' +
      '<span class="d">' + mdShort(l.date) + ' 周' + dayCN(l.date) + '</span>' +
      '<span class="a" style="color:' + esc(goal.color || COLORS[0]) + '">+' + nfmt(l.amount) + ' ' + esc(goal.unit || '') + '</span>' +
      (l.minutes ? '<span class="m">' + nfmt(l.minutes) + ' 分钟</span>' : '<span class="m" style="color:#c7cad8">未填分钟</span>') +
      (l.makeup ? '<span class="mk">补</span>' : '') +
      '<span class="sp"></span>' +
      '<button class="del" data-act="dellog" data-id="' + esc(l.id) + '" type="button" aria-label="删除这条记录">' + ic('trash', 15) + '</button></div>';
  }).join('') : '<div class="tiny" style="padding:8px 0">还没有记录，去「今日」打第一次卡。</div>';

  return '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title"><span class="dot" style="background:' + esc(goal.color || COLORS[0]) + '"></span>' + esc(goal.name) +
      (goal.seed ? '<span class="tag-seed">示例</span>' : '') +
      '<span class="sp"></span><span class="tiny">' + nfmt(goalDone(goal)) + ' / ' + nfmt(goal.total) + ' ' + esc(goal.unit || '') + '</span></div>' +
    '<div class="ring-wrap">' + ringSVG(pct, goal.color || COLORS[0]) +
      '<div class="board-stats">' +
        '<div class="bs"><div class="k">完成率</div><div class="v">' + pct.toFixed(0) + '%</div></div>' +
        '<div class="bs"><div class="k">连续打卡</div><div class="v">' + st + ' 天</div></div>' +
        '<div class="bs"><div class="k">预计完成日</div><div class="v ' + et.cls + '">' + esc(et.v) + '</div>' +
          (et.sub ? '<div class="k" style="margin-top:2px">' + esc(et.sub) + '</div>' : '') + '</div>' +
      '</div></div>' +
    ((goal.blocker || goal.counter) ? '<div class="gr-plan"><span class="k">最容易拦住我的：</span>' + esc(goal.blocker || '未填写') +
      '<br><span class="k">如果它出现，我就：</span>' + esc(goal.counter || '未填写') + '</div>' : '') +
    '<div class="log-list"><div class="tiny" style="font-weight:700;margin-bottom:2px">最近 10 条记录</div>' + recHTML + '</div>' +
    (done ? '' : '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + esc(goal.id) + '" type="button">' + ic('edit', 15) + '编辑目标</button></div>') +
  '</div>';
}

function chartHTML() {
  var t = todayStr(), days = [], i, j;
  for (i = 13; i >= 0; i--) days.push(addDays(t, -i));
  var used = {}, totals = [], maxV = 0, skipped = 0;
  var data = {};
  days.forEach(function (d) { data[d] = {}; });
  S.logs.forEach(function (l) {
    if (data[l.date] == null) return;
    if (l.minutes == null || !(Number(l.minutes) > 0)) { skipped++; return; }
    if (!data[l.date][l.goalId]) { data[l.date][l.goalId] = 0; used[l.goalId] = true; }
    data[l.date][l.goalId] += Number(l.minutes);
  });
  days.forEach(function (d) {
    var s = 0; for (var k in data[d]) s += data[d][k];
    totals.push(s); if (s > maxV) maxV = s;
  });
  var goalList = S.goals.filter(function (g) { return used[g.id]; });
  var W = 460, H = 200, mL = 38, mR = 8, mT = 10, mB = 30;
  var pw = W - mL - mR, ph = H - mT - mB;
  var step = pw / days.length, bw = Math.min(22, step * 0.6);
  var nice = maxV <= 0 ? 30 : (Math.ceil(maxV / 30) * 30 || 30);
  var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="min-width:400px;height:auto" role="img" aria-label="近 14 天投入分钟堆叠柱状图">';
  for (i = 0; i <= 3; i++) {
    var v = nice / 3 * i, y = mT + ph - (v / nice) * ph;
    out += '<line x1="' + mL + '" y1="' + y.toFixed(1) + '" x2="' + (W - mR) + '" y2="' + y.toFixed(1) + '" stroke="#eef0f7" stroke-width="1"/>';
    out += '<text x="' + (mL - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#8b93a7">' + Math.round(v) + '</text>';
  }
  days.forEach(function (d, idx) {
    var x = mL + step * idx + (step - bw) / 2, acc = 0;
    if (totals[idx] > 0) {
      goalList.forEach(function (g) {
        var v = data[d][g.id] || 0; if (!(v > 0)) return;
        var h = (v / nice) * ph, y = mT + ph - acc / nice * ph - h;
        out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + esc(g.color || COLORS[0]) + '" opacity=".92"><title>' + esc(g.name) + ' ' + mdShort(d) + '：' + v + ' 分钟</title></rect>';
        acc += v;
      });
      out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (mT + ph - acc / nice * ph - 4).toFixed(1) + '" text-anchor="middle" font-size="8.5" fill="#5a6378">' + acc + '</text>';
    } else {
      out += '<rect x="' + x.toFixed(1) + '" y="' + (mT + ph - 3) + '" width="' + bw.toFixed(1) + '" height="3" fill="#eef0f7" rx="1.5"><title>' + mdShort(d) + '：无记录</title></rect>';
    }
    var isToday = d === t;
    out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (mT + ph + 14) + '" text-anchor="middle" font-size="9" fill="' + (isToday ? '#4f46e5' : '#8b93a7') + '" font-weight="' + (isToday ? '700' : '400') + '">' + mdShort(d) + '</text>';
    out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (mT + ph + 25) + '" text-anchor="middle" font-size="8" fill="' + (isToday ? '#4f46e5' : '#c7cad8') + '">' + dayCN(d) + '</text>';
  });
  out += '<line x1="' + mL + '" y1="' + (mT + ph) + '" x2="' + (W - mR) + '" y2="' + (mT + ph) + '" stroke="#e8eaf2" stroke-width="1"/></svg>';
  return { svg: out, goalList: goalList, skipped: skipped, maxV: maxV, totals: totals, days: days };
}

function renderBoard() {
  var box = document.getElementById('board-list');
  if (box) {
    box.innerHTML = S.goals.length ? sortedGoals().map(boardCardHTML).join('')
      : '<div class="card" style="text-align:center;padding:34px 18px"><div style="font-weight:800;margin-bottom:4px">看板还是空的</div><div class="muted">先在「今日」建一个目标。</div></div>';
  }
  var chart = document.getElementById('chart');
  if (chart) {
    var r = chartHTML();
    chart.innerHTML = r.svg;
    var lg = document.getElementById('chart-legend');
    if (lg) lg.innerHTML = r.goalList.length ? r.goalList.map(function (g) { return '<span><i style="background:' + esc(g.color || COLORS[0]) + '"></i>' + esc(g.name) + '</span>'; }).join('') : '<span class="muted">暂无分钟数据</span>';
    var tip = document.getElementById('chart-tip');
    if (tip) {
      var withMin = 0; S.logs.forEach(function (l) { if (l.date >= r.days[0] && l.minutes != null) withMin++; });
      tip.innerHTML = '只统计填了分钟数的记录' + (r.skipped > 0 ? ('，近 14 天有 <b>' + r.skipped + '</b> 条没填分钟，未硬凑进图表') : '') +
        '；近 14 天共 ' + withMin + ' 条计时记录。';
    }
  }
}

/* =======================================================================
   10. 渲染层：周报
   ======================================================================= */
function weekRange(mon) { return { s: mon, e: addDays(mon, 6) }; }
function weekStats(mon) {
  var r = weekRange(mon), res = { mon: mon, s: r.s, e: r.e, per: {}, days: 0, minutes: 0, count: 0 };
  var dset = {};
  S.logs.forEach(function (l) {
    if (l.date < r.s || l.date > r.e) return;
    if (!res.per[l.goalId]) res.per[l.goalId] = 0;
    res.per[l.goalId] += (Number(l.amount) || 0);
    res.minutes += (Number(l.minutes) || 0);
    dset[l.date] = 1;
  });
  res.days = Object.keys(dset).length;
  S.goals.forEach(function (g) { if (res.per[g.id] == null) res.per[g.id] = 0; });
  return res;
}
function cmpText(cur, prev, unit) {
  var d = Math.round((cur - prev) * 10) / 10;
  if (Math.abs(d) < 0.05) return '<span class="cmp flat">环比持平</span>';
  return '<span class="cmp ' + (d > 0 ? 'up' : 'down') + '">环比 ' + (d > 0 ? '+' : '') + nfmt(d) + ' ' + esc(unit || '') + '</span>';
}

function renderWeek() {
  var mon = VIEW.week, t = todayStr();
  var cur = weekStats(mon), prev = weekStats(addDays(mon, -7));
  var lb = document.getElementById('wk-label');
  if (lb) {
    var isCur = mon === mondayOf(t);
    lb.textContent = mdShort(mon) + '–' + mdShort(cur.e) + (isCur ? '（本周）' : '');
    lb.style.color = isCur ? 'var(--brand)' : 'var(--ink)';
  }
  var nx = document.getElementById('wk-next');
  if (nx) nx.style.opacity = (mon >= mondayOf(t)) ? '.35' : '1';

  var sum = document.getElementById('wk-sum');
  if (sum) {
    var totalAmt = 0;
    S.goals.forEach(function (g) { totalAmt += (cur.per[g.id] || 0); });
    var totalAmtP = 0;
    S.goals.forEach(function (g) { totalAmtP += (prev.per[g.id] || 0); });
    sum.innerHTML =
      '<div class="wk-cell"><div class="k">投入量合计</div><div class="v">' + nfmt(totalAmt) + '</div>' +
        (cmpText(totalAmt, totalAmtP, '') ) + '</div>' +
      '<div class="wk-cell"><div class="k">打卡天数</div><div class="v">' + cur.days + ' 天</div>' + cmpText(cur.days, prev.days, '天') + '</div>' +
      '<div class="wk-cell"><div class="k">投入分钟</div><div class="v">' + cur.minutes + '</div>' + cmpText(cur.minutes, prev.minutes, '分') + '</div>';
  }
  var gl = document.getElementById('wk-goals');
  if (gl) {
    if (!S.goals.length) gl.innerHTML = '<div class="tiny">还没有目标。</div>';
    else {
      gl.innerHTML = S.goals.map(function (g) {
        var a = cur.per[g.id] || 0, p = prev.per[g.id] || 0, dd = Math.round((a - p) * 10) / 10;
        return '<div class="wk-goal"><i style="width:9px;height:9px;border-radius:3px;background:' + esc(g.color || COLORS[0]) + ';display:inline-block;flex:none"></i>' +
          '<span class="nm">' + esc(g.name) + '</span>' +
          '<span class="vv" style="color:' + esc(g.color || COLORS[0]) + '">' + nfmt(a) + ' ' + esc(g.unit || '') + '</span>' +
          '<span class="tiny" style="min-width:66px;text-align:right">' + (dd === 0 ? '持平' : (dd > 0 ? '+' : '') + nfmt(dd)) + '</span></div>';
      }).join('') + '<div class="tiny" style="margin-top:6px">分目标数值为区间内累计完成量（含补记）。</div>';
    }
  }
  var rv = null;
  for (var i = 0; i < S.reviews.length; i++) { if (S.reviews[i].week === mon) { rv = S.reviews[i]; break; } }
  var fields = [['keep', 'keep'], ['issue', 'issue'], ['tryIt', 'tryIt'], ['plan', 'plan']];
  fields.forEach(function (f) {
    var ta = document.querySelector('[data-rv="' + f[0] + '"]');
    if (!ta) return;
    if (document.activeElement === ta) return;   /* 正在输入时不打断 */
    var v = rv ? (rv[f[1]] || '') : '';
    if (ta.value !== v) ta.value = v;
  });
}

function buildReport() {
  var mon = VIEW.week, cur = weekStats(mon), prev = weekStats(addDays(mon, -7));
  var rv = null;
  for (var i = 0; i < S.reviews.length; i++) { if (S.reviews[i].week === mon) { rv = S.reviews[i]; break; } }
  var L = [];
  L.push('学习周报 ' + mon + ' ~ ' + cur.e);
  L.push('');
  L.push('一、本周投入');
  if (!S.goals.length) L.push('· 暂无目标');
  S.goals.forEach(function (g) {
    var a = cur.per[g.id] || 0, p = prev.per[g.id] || 0, d = Math.round((a - p) * 10) / 10;
    var tail = Math.abs(d) < 0.05 ? '（与上周持平）' : ('（上周 ' + nfmt(p) + '，' + (d > 0 ? '+' : '') + nfmt(d) + '）');
    L.push('· ' + g.name + '：' + nfmt(a) + ' ' + (g.unit || '') + ' ' + tail);
  });
  var ta = 0, tp = 0;
  S.goals.forEach(function (g) { ta += (cur.per[g.id] || 0); tp += (prev.per[g.id] || 0); });
  var dt = Math.round((ta - tp) * 10) / 10;
  L.push('· 合计：投入量 ' + nfmt(ta) + '，打卡 ' + cur.days + ' 天（上周 ' + prev.days + ' 天），投入 ' + cur.minutes + ' 分钟（上周 ' + prev.minutes + ' 分钟）');
  L.push('');
  L.push('二、复盘');
  L.push('保持：' + ((rv && rv.keep) || '（未填写）'));
  L.push('问题：' + ((rv && rv.issue) || '（未填写）'));
  L.push('尝试：' + ((rv && rv.tryIt) || '（未填写）'));
  L.push('下周预案：' + ((rv && rv.plan) || '（未填写）'));
  L.push('');
  L.push('三、目标进度');
  S.goals.forEach(function (g) {
    var e = etaText(g);
    L.push('· ' + g.name + '：' + pctOf(g).toFixed(0) + '%（' + nfmt(goalDone(g)) + '/' + nfmt(g.total) + ' ' + (g.unit || '') + '），截止 ' + g.due + '，预计完成日 ' + e.v + (e.sub ? '（' + e.sub + '）' : ''));
  });
  return L.join('\n');
}

/* =======================================================================
   11. 渲染层：我的
   ======================================================================= */
function renderMine() {
  var box = document.getElementById('sync-detail');
  if (!box) return;
  var label = { loading: '读取中', ok: '在线同步正常', offline: '离线模式（本机缓存）', error: '读取线上数据失败' };
  var color = { loading: 'var(--amber)', ok: 'var(--green)', offline: 'var(--amber)', error: 'var(--red)' };
  var seedN = 0; S.goals.forEach(function (g) { if (g.seed) seedN++; });
  box.innerHTML =
    '<div class="kv"><span class="k">当前状态</span><span class="v" style="color:' + color[SYNC.status] + '">' + label[SYNC.status] + '</span></div>' +
    '<div class="kv"><span class="k">最近一次同步</span><span class="v">' + (SYNC.last ? SYNC.last : '—') + '</span></div>' +
    '<div class="kv"><span class="k">线上数据表</span><span class="v">学习目标 / 每日打卡记录 / 每周复盘</span></div>' +
    '<div class="kv"><span class="k">目标 · 打卡记录 · 周复盘</span><span class="v">' + S.goals.length + ' · ' + S.logs.length + ' · ' + S.reviews.length + '</span></div>' +
    '<div class="kv"><span class="k">其中示例数据</span><span class="v">' + seedN + ' 个目标</span></div>';
}

/* =======================================================================
   12. 统一刷新入口（唯一调度点，渲染函数之间互不调用）
   ======================================================================= */
function refreshAll() {
  renderSync();
  renderToday();
  renderBoard();
  renderWeek();
  renderMine();
}

/* =======================================================================
   13. 交互动作
   ======================================================================= */
function nowTime() {
  var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function switchTab(name) {
  VIEW.tab = name;
  var btns = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < btns.length; i++) btns[i].className = 'nav-btn' + (btns[i].getAttribute('data-tab') === name ? ' active' : '');
  var panels = document.querySelectorAll('.tab-panel');
  for (var j = 0; j < panels.length; j++) panels[j].className = 'tab-panel' + (panels[j].id === 'tab-' + name ? ' active' : '');
  window.scrollTo(0, 0);
}

function goalFormHTML(g) {
  g = g || { name: '', unit: '', total: '', due: addDays(todayStr(), 30), color: COLORS[0], blocker: '', counter: '' };
  var sw = COLORS.map(function (c) {
    return '<button type="button" class="swatch' + (c === g.color ? ' on' : '') + '" data-f="color" data-c="' + c + '" style="background:' + c + '" aria-label="配色"></button>';
  }).join('');
  return '<h3>' + (g.id ? '编辑目标' : '新建学习目标') + '</h3>' +
    '<div class="sub">适合有终点、有总量的目标，例如「背完 2000 个单词」「读完 440 页」。</div>' +
    '<div class="form-grid">' +
      '<div class="fld"><label>目标名称</label><input id="g-name" type="text" value="' + esc(g.name) + '" placeholder="例：背完考研核心词"></div>' +
      '<div class="form-grid two">' +
        '<div class="fld"><label>总量</label><input id="g-total" type="number" inputmode="decimal" min="1" step="any" value="' + esc(g.total) + '" placeholder="2000"></div>' +
        '<div class="fld"><label>单位</label><input id="g-unit" type="text" value="' + esc(g.unit) + '" placeholder="个 / 页 / 节"></div>' +
      '</div>' +
      '<div class="fld"><label>截止日</label><input id="g-due" type="date" value="' + esc(g.due) + '"></div>' +
      '<div class="fld"><label>配色</label><div class="swatches" id="g-colors">' + sw + '</div></div>' +
      '<div class="fld"><label>最容易拦住我的障碍（选填）</label><textarea id="g-blocker" placeholder="例：晚上一躺下就开始刷手机">' + esc(g.blocker) + '</textarea></div>' +
      '<div class="fld"><label>如果它出现，我就……（选填）</label><textarea id="g-counter" placeholder="例：把手机放到客厅，先背 20 个再拿回来">' + esc(g.counter) + '</textarea></div>' +
    '</div>' +
    '<div class="modal-acts"><button class="btn btn-ghost" data-close type="button">取消</button>' +
    '<button class="btn btn-primary" id="g-save" type="button">' + (g.id ? '保存修改' : '创建目标') + '</button></div>';
}

function openGoalForm(goal) {
  openModal(goalFormHTML(goal));
  var swBox = document.getElementById('g-colors');
  swBox.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-f="color"]') : null;
    if (!b) return;
    var all = swBox.querySelectorAll('.swatch');
    for (var i = 0; i < all.length; i++) all[i].className = 'swatch';
    b.className = 'swatch on';
  });
  document.getElementById('g-save').addEventListener('click', function () {
    var name = (document.getElementById('g-name').value || '').trim();
    var unit = (document.getElementById('g-unit').value || '').trim();
    var total = Math.max(0, parseFloat(document.getElementById('g-total').value) || 0);
    var due = (document.getElementById('g-due').value || '').slice(0, 10);
    var on = swBox.querySelector('.swatch.on');
    var color = on ? on.getAttribute('data-c') : COLORS[0];
    if (!name) { toast('给目标起个名字', 'err'); return; }
    if (!(total > 0)) { toast('总量要大于 0', 'err'); return; }
    if (!due) { toast('选一个截止日', 'err'); return; }
    var patch = {
      name: name, unit: unit || '次', total: total, due: due, color: color,
      blocker: (document.getElementById('g-blocker').value || '').trim(),
      counter: (document.getElementById('g-counter').value || '').trim()
    };
    if (goal) { for (var k in patch) goal[k] = patch[k]; }
    closeModal();
    var btn = this; btn.disabled = true;
    (goal ? actUpdateGoal(goal) : actAddGoal(patch)).then(function () {
      refreshAll(); toast(goal ? '已保存修改' : '目标已创建，数据已写回线上', 'ok');
    }).catch(function () { toast('写入线上失败，请重试', 'err'); }).then(function () { btn.disabled = false; });
  });
}

function doCheckin(goalId) {
  var goal = goalById(goalId); if (!goal) return;
  var row = document.getElementById('row-' + goalId);
  if (!row) return;
  var amtEl = row.querySelector('[data-f="amt"]'), minEl = row.querySelector('[data-f="min"]'), dateEl = row.querySelector('[data-f="date"]');
  var amt = parseFloat(amtEl && amtEl.value);
  if (!(amt > 0)) { toast('完成量要大于 0', 'err'); if (amtEl) amtEl.focus(); return; }
  var mins = (minEl && String(minEl.value).trim() !== '') ? Math.max(0, parseInt(minEl.value, 10) || 0) : null;
  var date = (dateEl && dateEl.value) || todayStr();
  var wasDone = isDone(goal);
  var log = { id: uid(), goalId: goal.id, goalName: goal.name, date: date, amount: amt, minutes: mins, makeup: date !== todayStr() };
  var btn = row.querySelector('[data-act="checkin"]'); if (btn) btn.disabled = true;
  actAddLog(log).then(function () {
    if (!wasDone && isDone(goal)) confetti();
    refreshAll();
    toast('已记录 +' + nfmt(amt) + ' ' + (goal.unit || '') + (log.makeup ? '（补记 ' + mdShort(date) + '）' : ''), 'ok');
  }).catch(function () { toast('写入线上失败，数据没存上，请重试', 'err'); })
    .then(function () { if (btn) btn.disabled = false; refreshAll(); });
}

function doDeleteGoal(goalId) {
  var goal = goalById(goalId); if (!goal) return;
  var n = logsOf(goalId).length;
  confirmModal({
    title: '删除目标「' + goal.name + '」？',
    warn: '删除后，这个目标下的 ' + n + ' 条打卡记录会一起删除，线上数据同步清除，无法恢复。',
    desc: '如果只是想改目标值，用「编辑」更合适。',
    okText: '确认删除', danger: true,
    onOk: function () {
      var btn = document.getElementById('btn-clear-all');
      actDeleteGoal(goalId).then(function () { refreshAll(); toast('目标已删除', 'ok'); })
        .catch(function () { toast('删除线上数据失败，请重试', 'err'); });
    }
  });
}

function doDeleteLog(logId, btn) {
  var l = null; for (var i = 0; i < S.logs.length; i++) { if (S.logs[i].id === logId) { l = S.logs[i]; break; } }
  if (!l) return;
  actDeleteLog(logId).then(function () { refreshAll(); toast('已删除这条记录', 'ok'); })
    .catch(function () { toast('删除线上记录失败，请重试', 'err'); });
}

function doClearSeed() {
  var ids = S.goals.filter(function (g) { return g.seed; }).map(function (g) { return g.id; });
  if (!ids.length) { toast('已经没有示例数据了'); return; }
  confirmModal({
    title: '清空示例数据？',
    warn: '将删除 ' + ids.length + ' 个带「示例」标记的目标及其打卡记录，你自己创建的目标不受影响。',
    okText: '清空示例', danger: true,
    onOk: function () {
      var chain = Promise.resolve();
      ids.forEach(function (id) { chain = chain.then(function () { return actDeleteGoal(id); }); });
      chain.then(function () { refreshAll(); toast('示例数据已清空', 'ok'); }).catch(function () { toast('清理失败，请重试', 'err'); });
    }
  });
}

function doClearAll() {
  confirmModal({
    title: '清空全部数据？',
    warn: '将删除全部目标、打卡记录和周复盘，线上数据表也会被清空，无法恢复。',
    input: true, inputLabel: '请输入「清空」两个字确认', inputPlaceholder: '清空',
    okText: '确认清空', danger: true,
    onOk: function () {
      var chain = Promise.resolve();
      S.logs.slice().forEach(function (l) { chain = chain.then(function () { return actDeleteLog(l.id); }); });
      S.goals.slice().forEach(function (g) { chain = chain.then(function () { return actDeleteGoal(g.id); }); });
      S.reviews.slice().forEach(function (r) { chain = chain.then(function () { return actDeleteReview(r.id); }); });
      chain.then(function () { refreshAll(); toast('全部数据已清空', 'ok'); }).catch(function () { toast('清空未完成，请重试', 'err'); refreshAll(); });
    }
  });
}

function doPull(manual) {
  SYNC.status = 'loading'; renderSync();
  pullAll().then(function () {
    SYNC.status = 'ok'; SYNC.last = nowTime();
  }).catch(function (e) {
    var hasSdk = !!DB();
    loadCache();
    SYNC.status = hasSdk ? 'error' : 'offline';
    SYNC.last = localStorage.getItem(CACHE_DTS) ? ('缓存于 ' + String(localStorage.getItem(CACHE_DTS)).slice(11, 19)) : '';
    if (manual) toast(hasSdk ? '读取线上数据失败，当前为本机缓存' : '未检测到线上数据通道，已用本机缓存', 'err');
  }).then(function () {
    refreshAll();
  });
}

var rvTimer = null;
function saveReviewField(field) {
  var mon = VIEW.week;
  var rv = null;
  for (var i = 0; i < S.reviews.length; i++) { if (S.reviews[i].week === mon) { rv = S.reviews[i]; break; } }
  if (!rv) { rv = { id: uid(), week: mon, keep: '', issue: '', tryIt: '', plan: '' }; }
  var ta = document.querySelector('[data-rv="' + field + '"]');
  rv[field] = ta ? ta.value : '';
  actSaveReview(rv).then(function () {
    S.reviews = S.reviews.filter(function (x) { return x.week !== mon; });
    if (rv.__rid || rv.id) S.reviews.push(rv);
    var ind = document.getElementById('rv-save'); if (ind) ind.textContent = '已保存 ' + nowTime().slice(0, 5);
    saveCache();
  }).catch(function () { toast('周复盘保存失败，请重试', 'err'); });
}

/* =======================================================================
   14. 事件绑定
   ======================================================================= */
function bindStatic() {
  var navs = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < navs.length; i++) {
    navs[i].addEventListener('click', function () { switchTab(this.getAttribute('data-tab')); });
  }
  var nb = document.getElementById('btn-new-top'), nb2 = document.getElementById('btn-new-bottom');
  if (nb) nb.addEventListener('click', function () { openGoalForm(null); });
  if (nb2) nb2.addEventListener('click', function () { openGoalForm(null); });
  var wp = document.getElementById('wk-prev'), wn = document.getElementById('wk-next');
  if (wp) wp.addEventListener('click', function () { VIEW.week = addDays(VIEW.week, -7); refreshAll(); });
  if (wn) wn.addEventListener('click', function () {
    if (VIEW.week >= mondayOf(todayStr())) { toast('已经是本周了'); return; }
    VIEW.week = addDays(VIEW.week, 7); refreshAll();
  });
  var gr = document.getElementById('btn-gen-report');
  if (gr) gr.addEventListener('click', function () {
    document.getElementById('report-out').value = buildReport();
    toast('周报已生成，可直接复制', 'ok');
  });
  var bc = document.getElementById('btn-copy-report');
  if (bc) bc.addEventListener('click', function () {
    var ta = document.getElementById('report-out');
    if (!ta.value.trim()) { toast('先点「生成周报」', 'err'); return; }
    ta.select(); ta.setSelectionRange(0, 999999);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) { navigator.clipboard.writeText(ta.value); ok = true; }
    toast(ok ? '已复制到剪贴板' : '复制失败，请手动选中复制', ok ? 'ok' : 'err');
  });
  var rs = document.getElementById('btn-resync');
  if (rs) rs.addEventListener('click', function () { doPull(true); });
  var cs = document.getElementById('btn-clear-seed');
  if (cs) cs.addEventListener('click', doClearSeed);
  var ca = document.getElementById('btn-clear-all');
  if (ca) ca.addEventListener('click', doClearAll);

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var f = el.getAttribute('data-rv');
    if (f) {
      clearTimeout(rvTimer);
      rvTimer = setTimeout(function () { saveReviewField(f); }, 700);
    }
  }, false);
}

function bindDelegates() {
  document.addEventListener('click', function (e) {
    var el = e.target;
    var btn = el && el.closest ? el.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
    if (act === 'resync') { doPull(true); return; }
    if (act === 'edit') { openGoalForm(goalById(id)); return; }
    if (act === 'del') { doDeleteGoal(id); return; }
    if (act === 'dellog') { doDeleteLog(id, btn); return; }
    if (act === 'focus') {
      switchTab('today');
      setTimeout(function () {
        var row = document.getElementById('row-' + id);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var inp = row.querySelector('[data-f="amt"]');
        if (inp) { try { inp.focus(); inp.select(); } catch (err) {} }
      }, 120);
      return;
    }
    if (act === 'checkin') { doCheckin(id); return; }
  }, false);

  document.addEventListener('click', function (e) {
    var el = e.target;
    var btn = el && el.closest ? el.closest('[data-act="dellog"]') : null;
    if (!btn) return;
    if (btn.getAttribute('data-armed') !== '1') {
      e.stopPropagation();
      btn.setAttribute('data-armed', '1');
      btn.className = 'del confirm';
      btn.innerHTML = '再点一次删除';
      setTimeout(function () { btn.className = 'del'; btn.innerHTML = ic('trash', 15); btn.removeAttribute('data-armed'); }, 3200);
    }
  }, false);
}

/* =======================================================================
   15. 启动：先出界面，再拉线上数据
   ======================================================================= */
function boot() {
  bindStatic();
  bindDelegates();
  /* 先用缓存（或空态）把界面渲染出来，绝不白屏 */
  loadCache();
  SYNC.status = 'loading';
  refreshAll();
  doPull(false);
  /* 跨天/跨零点时自动对齐今天 */
  setInterval(function () {
    if (VIEW.__day && VIEW.__day !== todayStr()) { VIEW.__day = todayStr(); VIEW.week = mondayOf(todayStr()); refreshAll(); }
    VIEW.__day = todayStr();
  }, 60000);
  VIEW.__day = todayStr();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
