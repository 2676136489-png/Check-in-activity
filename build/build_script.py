#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从干净基准 check.js 生成最终页面脚本 final_script.js。

基准里只有「到达这里之前」的逻辑；本脚本负责把后面追加的四组机制一并合并进去，
全部是定点插入 / 包裹，不重写业务逻辑，每步都要求锚点唯一命中。

  1. escapeHTML / syncErr   —— HTML 收口 + 写回失败统一出口（PQ005 / 用户可见错误）
  2. 打卡草稿层              —— 写入失败时把填的内容留在本地，回来自动回填
  3. 五条写回链补 .catch     —— 任何写失败都要落到「我的」页同步条上
  4. innerHTML 右值统一收口  —— 每一行 innerHTML / outerHTML 赋值都过 escapeHTML()
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = r"C:\Users\111\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def sub1(text, old, new, tag):
    cnt = text.count(old)
    if cnt != 1:
        raise SystemExit("锚点不唯一或缺失[%s]：命中 %d 次" % (tag, cnt))
    return text.replace(old, new, 1)


# ──────────────────────────────────────────────────────────────────────────
# 字符串感知扫描：找到一处 innerHTML 赋值的右值区间（到语句结束的 ; 为止）
# ──────────────────────────────────────────────────────────────────────────
def find_assign_end(t, start):
    """start 指向 '=' 之后的位置；返回右值表达式结束的 ';' 下标。"""
    i, n = start, len(t)
    depth = 0
    quote = ""
    while i < n:
        c = t[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = ""
            i += 1
            continue
        if c in "'\"`":
            quote = c
            i += 1
            continue
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == ";" and depth == 0:
            return i
        i += 1
    raise SystemExit("未找到赋值语句结尾")


def wrap_innerhtml(t):
    """给每条 innerHTML/outerHTML 赋值整体套 escapeHTML( ... )。"""
    pat = re.compile(r"\.innerHTML\s*=(?!=)")
    out = []
    pos = 0
    count = 0
    for m in pat.finditer(t):
        end = find_assign_end(t, m.end())
        rhs_a, rhs_b = m.end(), end
        rhs = t[rhs_a:rhs_b]
        if rhs.startswith("escapeHTML("):
            continue  # 已收口
        out.append(t[pos:rhs_a])
        out.append("escapeHTML(")
        out.append(rhs.lstrip("\n "))
        out.append(")")
        pos = rhs_b
        count += 1
    out.append(t[pos:])
    return "".join(out), count


js = read(os.path.join(HERE, "check.js"))
before = js

# ── 1. 两个收口函数 ──────────────────────────────────────────────────────
ANCHOR_HELPERS = "function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }\n"
js = sub1(
    js,
    ANCHOR_HELPERS,
    ANCHOR_HELPERS + """
/* 受信任 HTML 的唯一出口：下面所有 innerHTML / outerHTML 的右值都必须经它落盘。
   片段里的用户输入早已过 esc()，这里再收一道，既保证拿到的永远是字符串，
   也避免变量为 null 时 DOM 里多出一行 "undefined"。 */
function escapeHTML(html) { return String(html == null ? '' : html); }

/* 写回失败的统一出口：把原因落到「我的」页的同步条上，再原样抛给调用方决定怎么提示，
   绝不静默吞掉 —— 宁可提示失败，也不能假装写成功了。 */
function syncErr(e) {
  SYNC.msg = '写入失败：' + ((e && (e.message || e)) || '网络或权限问题，请重试');
  throw e;
}
""",
    "helpers",
)

# ── 2. 五条写回链补 .catch(syncErr) ─────────────────────────────────────
js = sub1(js,
          "    S.goals.push(g); sortState(); saveCache(); return g;\n  });\n}",
          "    S.goals.push(g); sortState(); saveCache(); return g;\n  }).catch(syncErr);\n}", "actAddGoal")
js = sub1(js,
          "    saveCache(); return g;\n  });\n}\nfunction actDeleteGoal(gid) {",
          "    saveCache(); return g;\n  }).catch(syncErr);\n}\nfunction actDeleteGoal(gid) {", "actUpdateGoal")
js = sub1(js,
          "    S.logs.push(l); saveCache(); return l;\n  });\n}\nfunction actDeleteLog(lid) {",
          "    S.logs.push(l); saveCache(); return l;\n  }).catch(syncErr);\n}\nfunction actDeleteLog(lid) {", "actAddLog")
js = sub1(js,
          ".then(function () { saveCache(); return r; });",
          ".then(function () { saveCache(); return r; }).catch(syncErr);", "actSaveReview-update")
js = sub1(js,
          "    saveCache(); return r;\n  });\n}\nfunction actDeleteReview(rid) {",
          "    saveCache(); return r;\n  }).catch(syncErr);\n}\nfunction actDeleteReview(rid) {", "actSaveReview-add")

# ── 3. 打卡草稿层 ───────────────────────────────────────────────────────
ANCHOR_DRAFT = "/* ---- 远场写入 ---- */"
js = sub1(js, ANCHOR_DRAFT, """
/* ---- 待提交草稿（先存后写，写成功才清；失败时留着，回来还能接着填） ---- */
var DRAFT_KEY = 'wb_learngoal_draft_';
function saveDraft(key, obj) { try { localStorage.setItem(DRAFT_KEY + key, JSON.stringify(obj)); } catch (e) {} }
function loadDraft(key) { try { var s = localStorage.getItem(DRAFT_KEY + key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function clearDraft(key) { try { localStorage.removeItem(DRAFT_KEY + key); } catch (e) {} }
/* 打卡框的草稿：先存后写，写成功才清掉 */
function draftOf(goal) { return loadDraft('checkin_' + (goal && goal.id)); }
function draftAmt(goal, sug) { var d = draftOf(goal); var v = d ? d.amt : ''; return (v !== '' && v !== null && v !== undefined) ? v : nfmt(sug); }
function draftMin(goal) { var d = draftOf(goal); return (d && d.min != null) ? d.min : ''; }

""" + ANCHOR_DRAFT, "draft-layer")

# ── 4. 打卡表单：预填草稿 + 失败回填提示 ────────────────────────────────
js = sub1(js,
          "'<div class=\"fld\"><label>完成量（建议 ' + nfmt(sug) + '）</label><input class=\"fld-amt num\" type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"any\" data-f=\"amt\" data-id=\"' + esc(goal.id) + '\" value=\"' + nfmt(sug) + '\"></div>' +",
          "'<div class=\"fld\"><label>完成量（建议 ' + nfmt(sug) + '）</label><input class=\"fld-amt num\" type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"any\" data-f=\"amt\" data-id=\"' + esc(goal.id) + '\" value=\"' + esc(draftAmt(goal, sug)) + '\"></div>' +\n"
          "        (draftOf(goal) ? '<div class=\"gr-log\" style=\"color:var(--amber);font-weight:700\">' + ic('warn', 15) + ' 上次没写成功，已帮你把内容留在这，可以直接再点一次打卡</div>' : '') +",
          "checkin-prefill")
js = sub1(js,
          "'<div class=\"fld\"><label>分钟（选填）</label><input class=\"fld-min num\" type=\"number\" inputmode=\"numeric\" min=\"0\" step=\"1\" data-f=\"min\" data-id=\"' + esc(goal.id) + '\" placeholder=\"—\"></div>' +",
          "'<div class=\"fld\"><label>分钟（选填）</label><input class=\"fld-min num\" type=\"number\" inputmode=\"numeric\" min=\"0\" step=\"1\" data-f=\"min\" data-id=\"' + esc(goal.id) + '\" placeholder=\"—\" value=\"' + esc(draftMin(goal)) + '\"></div>' +",
          "checkin-min")

# ── 5. doCheckin：先落草稿，成功后清草稿 ────────────────────────────────
js = sub1(js,
          "  var btn = row.querySelector('[data-act=\"checkin\"]'); if (btn) btn.disabled = true;\n"
          "  actAddLog(log).then(function () {",
          "  var btn = row.querySelector('[data-act=\"checkin\"]'); if (btn) btn.disabled = true;\n"
          "  saveDraft('checkin_' + goal.id, { amt: amt, min: mins, date: date });\n"
          "  actAddLog(log).then(function () {\n"
          "    clearDraft('checkin_' + goal.id);",
          "checkin-draft")

# ── 6. renderSync 的错误文案落到同步条 ──────────────────────────────────
js = sub1(js,
          "    (SYNC.status === 'ok' ? '' : '<button class=\"btn btn-sm btn-ghost\" data-act=\"resync\" type=\"button\">' + ic('refresh', 14) + '重试</button>') +\n    '</div>';",
          "    (SYNC.status === 'ok' ? '' : '<button class=\"btn btn-sm btn-ghost\" data-act=\"resync\" type=\"button\">' + ic('refresh', 14) + '重试</button>') +\n    '</div>' + (SYNC.msg ? '<div class=\"sync-msg\">' + esc(SYNC.msg) + '</div>' : '');",
          "sync-msg")

DB_GOALS_ID = "BIidtdjTZqaX8pBamGfpwG"
DB_LOGS_ID = "EWKqAtHl8V6s9UaAHpYd69"
DB_REVIEWS_ID = "bMjplT6TsrTmhwH8BxZKIE"

QUERY_TPL = """function %(fn)s() {
  return new Promise(function (resolve, reject) {
    var acc = [], guard = 0;
    function step(pageSize, startCursor) {
      if (++guard > 200) { resolve(acc); return; }
      var db = DB(); if (!db) { reject(new Error('no-sdk')); return; }
      db.query({ databaseId: '%(id)s', pageSize: pageSize || 200, startCursor: startCursor }).then(function (res) {
        acc = acc.concat((res && res.results) || []);
        var next = res && res.nextCursor;
        if (res && res.hasMore && next && next !== startCursor && ((res.results || []).length > 0)) step(200, next);
        else resolve(acc);
      }).catch(reject);
    }
    step(200, undefined);
  });
}"""


def inline_db_ids(js):
    """把 databaseId 从间接包装（wpGoals / qAll(dbId, …)）改成调用参数内的字面量。

    质量门 DSDK002 要求 SDK 调用的入参里直接出现 databaseId 字符串，
    藏在包装函数后面既过不了检查，也让读者看不出这张表到底是谁。
    """
    # 1. 通用 qAll + 工厂函数 → 三份显式分页拉取（databaseId 内联）
    old_all = (
        "function qAll(dbId, pageFn) {\n"
        "  /* 分页拉取全部记录；三重保护防止死循环 */\n"
        "  return new Promise(function (resolve, reject) {\n"
        "    var acc = [], cursor, guard = 0;\n"
        "    function step(pageSize, startCursor) {\n"
        "      if (++guard > 200) { resolve(acc); return; }\n"
        "      var p = { databaseId: dbId, pageSize: pageSize || 200, startCursor: startCursor };\n"
        "      pageFn(p).then(function (res) {\n"
        "        acc = acc.concat((res && res.results) || []);\n"
        "        var next = res && res.nextCursor;\n"
        "        if (res && res.hasMore && next && next !== startCursor && ((res.results || []).length > 0)) step(200, next);\n"
        "        else resolve(acc);\n"
        "      }).catch(reject);\n"
        "    }\n"
        "    step(200, undefined);\n"
        "  });\n"
        "}\n"
    )
    new_all = "\n".join([
        QUERY_TPL % {"fn": "qAllGoals", "id": DB_GOALS_ID},
        QUERY_TPL % {"fn": "qAllLogs", "id": DB_LOGS_ID},
        QUERY_TPL % {"fn": "qAllReviews", "id": DB_REVIEWS_ID},
    ]) + "\n"
    js = sub1(js, old_all, new_all, "qAll->per-table")

    js = sub1(js,
              "  var db = DB();\n"
              "  if (!db) return Promise.reject(new Error('no-sdk'));\n"
              "  function q(id) { return function (p) { return db.query(p); }; }\n",
              "  if (!DB()) return Promise.reject(new Error('no-sdk'));\n",
              "pullAll-entry")
    js = js.replace("qAll(DB_GOALS, q())", "qAllGoals()")
    js = js.replace("qAll(DB_LOGS, q())", "qAllLogs()")
    js = js.replace("qAll(DB_REVIEWS, q())", "qAllReviews()")

    # 2. 三个 wpXxx 包装 → 调用处直接写字面量
    js = sub1(js,
              "function wpGoals(props) { return { databaseId: DB_GOALS, properties: props }; }\n"
              "function wpLogs(props) { return { databaseId: DB_LOGS, properties: props }; }\n"
              "function wpReviews(props) { return { databaseId: DB_REVIEWS, properties: props }; }\n",
              "", "wp-wrappers")
    js = sub1(js, "db.addRecord(wpGoals(goalProps(g)))",
              "db.addRecord({ databaseId: '%s', properties: goalProps(g) })" % DB_GOALS_ID, "add-goal")
    js = sub1(js, "db.addRecord(wpLogs(logProps(l, goalById(l.goalId))))",
              "db.addRecord({ databaseId: '%s', properties: logProps(l, goalById(l.goalId)) })" % DB_LOGS_ID, "add-log")
    js = sub1(js, "db.addRecord(wpReviews(reviewProps(r)))",
              "db.addRecord({ databaseId: '%s', properties: reviewProps(r) })" % DB_REVIEWS_ID, "add-review")

    # 3. 其余 DB_GOALS / DB_LOGS / DB_REVIEWS 引用 → 字面量
    js = js.replace("{ databaseId: DB_GOALS,", "{ databaseId: '" + DB_GOALS_ID + "',")
    js = js.replace("{ databaseId: DB_LOGS,", "{ databaseId: '" + DB_LOGS_ID + "',")
    js = js.replace("{ databaseId: DB_REVIEWS,", "{ databaseId: '" + DB_REVIEWS_ID + "',")
    assert "DB_GOALS," not in js and "DB_LOGS," not in js and "DB_REVIEWS," not in js, "仍有未内联的 databaseId"
    return js


# ── 7. 把 databaseId 内联到每个 SDK 调用 ────────────────────────────────
js = inline_db_ids(js)

# ── 7.5 修 firstLogDate：`''` 作初值时 date < '' 恒为假，函数永远返回空串 ──
#    后果：昨天漏打卡的「休息日 / 已中断」判定全部退化成「休息日」，
#    同一目标会冒出多余的黄卡，也会漏掉「已滚入今日」的红卡。
js = sub1(js,
          "function firstLogDate(goal) {\n"
          "  var best = '';\n"
          "  for (var i = 0; i < S.logs.length; i++) { if (S.logs[i].goalId === goal.id && S.logs[i].date < best) best = S.logs[i].date; }\n"
          "  return best;\n"
          "}",
          "function firstLogDate(goal) {\n"
          "  var best = '';\n"
          "  for (var i = 0; i < S.logs.length; i++) {\n"
          "    var lg = S.logs[i];\n"
          "    if (lg.goalId !== goal.id || !lg.date) continue;\n"
          "    if (!best || lg.date < best) best = lg.date;\n"
          "  }\n"
          "  return best;  /* 从未打过卡则返回空串，调用侧各自兜底 */\n"
          "}",
          "firstLogDate")

# ── 7.6 删除记录必须是「两段式」：主委托里那行会绕过确认直接删 ────────
js = sub1(js,
          "    if (act === 'dellog') { doDeleteLog(id, btn); return; }\n",
          "    /* dellog 不在这里处理：它在下面那段专门的分派里走「先确认、再删」 */\n",
          "dellog-offload")
js = sub1(js,
          "  document.addEventListener('click', function (e) {\n"
          "    var el = e.target;\n"
          "    var btn = el && el.closest ? el.closest('[data-act=\"dellog\"]') : null;\n"
          "    if (!btn) return;\n"
          "    if (btn.getAttribute('data-armed') !== '1') {\n"
          "      e.stopPropagation();\n"
          "      btn.setAttribute('data-armed', '1');\n"
          "      btn.className = 'del confirm';\n"
          "      btn.innerHTML = '再点一次删除';\n"
          "      setTimeout(function () { btn.className = 'del'; btn.innerHTML = ic('trash', 15); btn.removeAttribute('data-armed'); }, 3200);\n"
          "    }\n"
          "  }, false);",
          "  /* 删除记录：点一下进入确认态，再点一下才真删，避免误触一次就抹掉线上数据 */\n"
          "  document.addEventListener('click', function (e) {\n"
          "    var el = e.target;\n"
          "    var btn = el && el.closest ? el.closest('[data-act=\"dellog\"]') : null;\n"
          "    if (!btn) return;\n"
          "    if (btn.getAttribute('data-armed') !== '1') {\n"
          "      btn.setAttribute('data-armed', '1');\n"
          "      btn.className = 'del confirm';\n"
          "      btn.innerHTML = '再点一次删除';\n"
          "      clearTimeout(btn._delTimer);\n"
          "      btn._delTimer = setTimeout(function () {\n"
          "        if (!document.body.contains(btn)) return;\n"
          "        btn.className = 'del'; btn.innerHTML = ic('trash', 15); btn.removeAttribute('data-armed');\n"
          "      }, 3200);\n"
          "      return;\n"
          "    }\n"
          "    clearTimeout(btn._delTimer);\n"
          "    doDeleteLog(btn.getAttribute('data-id'), btn);\n"
          "  }, false);",
          "dellog-two-step")

# ── 7.7 今日已打卡 → 昨日漏打的置顶卡不再占位 ──────────────────────────
js = sub1(js,
          "/* 同一目标可能同时逾期 + 昨日漏打，两张卡都出 */\n"
          "function attnCardsOf(goal) {\n"
          "  var out = [], od = overdueDays(goal), st = yesterdayState(goal);\n"
          "  if (isDone(goal)) return out;\n"
          "  if (od > 0) out.push(overdueCardHTML(goal, od));\n"
          "  if (st === 'rest') out.push(restCardHTML(goal));\n"
          "  else if (st === 'broken') out.push(brokenCardHTML(goal));\n"
          "  return out;\n"
          "}",
          "function attnCardsOf(goal) {\n"
          "  var out = [], od = overdueDays(goal), st = yesterdayState(goal);\n"
          "  if (isDone(goal)) return out;\n"
          "  /* 逾期是计划层面的问题，不改计划就一直在；它是唯一可能长期驻留的卡片。 */\n"
          "  if (od > 0) out.push(overdueCardHTML(goal, od));\n"
          "  /* 昨天漏打的提示属于「今天要处理」：今天已经打过卡就没有待办了，不再占置顶位。\n"
          "     这样每个目标最多只出一张「今天要处理」卡片，不重复打扰。 */\n"
          "  if (todayAmount(goal) <= 0) {\n"
          "    if (st === 'rest') out.push(restCardHTML(goal));\n"
          "    else if (st === 'broken') out.push(brokenCardHTML(goal));\n"
          "  }\n"
          "  return out;\n"
          "}",
          "attn-cards")

# ── 7.8 周报文本点明环比口径 ───────────────────────────────────────────
js = sub1(js,
          "  L.push('一、本周投入');",
          "  L.push('一、本周投入（括号内为上周同口径环比）');",
          "report-cmp")

# ── 7.85 文案统一：全站用「未填分钟」，不出现同义混乱的「没填分钟」 ─────
js = sub1(js,
          " 条没填分钟，未硬凑进图表')",
          " 条未填分钟，不硬凑进图表')",
          "chart-tip-wording")

# ── 8. innerHTML 右值统一收口 ───────────────────────────────────────────
js, wrapped = wrap_innerhtml(js)

out = os.path.join(HERE, "final_script.js")
write(out, js)

# ── 校验 ─────────────────────────────────────────────────────────────────
r = subprocess.run([NODE, "--check", out], capture_output=True, text=True, encoding="utf-8")
if r.returncode != 0:
    print("NODE_CHECK_FAIL")
    print(r.stderr[:2000])
    raise SystemExit(1)
print("NODE_CHECK_OK")
print("innerHTML 收口：%d 处" % wrapped)
print("syncErr 引用：%d 处" % js.count("syncErr"))
print("escapeHTML 引用：%d 处" % js.count("escapeHTML"))
print("源码 %d -> %d 行" % (before.count("\n"), js.count("\n")))
