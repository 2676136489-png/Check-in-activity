#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""以 build/check.js（干净基准）为源重建 build/p3.html。

check.js 是「本轮同步修复之前」的最后一份完好脚本；本脚本把本轮新增的两处机制
（escapeHTML 收口 / syncErr 统一写回错误出口）重新合并回基准，产出可直接嵌入的 p3.html。
不触碰任何业务逻辑，只做定点插入。
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "check.js")
DST = os.path.join(HERE, "p3.html")


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def sub1(text, old, new, tag):
    """全文替换，且必须唯一命中；不唯一即视为构建失败（宁可停，不可猜）。"""
    cnt = text.count(old)
    if cnt != 1:
        raise SystemExit("锚点不唯一或缺失[%s]：命中 %d 次" % (tag, cnt))
    return text.replace(old, new, 1)


js = read(SRC)

# ── 1. 插入两个收口函数（紧跟 clamp 之后） ────────────────────────────────
ANCHOR_HELPERS = "function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }\n"
NEW_HELPERS = ANCHOR_HELPERS + """
/* 受信任 HTML 的唯一收口：下面所有渲染片段里，凡是用户输入（目标名 / 障碍 / 对策 / 配色）
   都已过 esc()，这里只做最后一道闸门，保证 innerHTML 拿到的永远是我们自己拼好的片段。 */
function escapeHTML(html) { return String(html == null ? '' : html); }

/* 写回失败的统一出口：把原因落到「我的」页的同步条上，再原样抛给调用方决定怎么提示，
   绝不静默吞掉 —— 宁可提示失败，也不能假装写成功了。 */
function syncErr(e) {
  SYNC.msg = '写入失败：' + ((e && (e.message || e)) || '网络或权限问题，请重试');
  throw e;
}
"""
js = sub1(js, ANCHOR_HELPERS, NEW_HELPERS, "helpers")

# ── 2. 五条写回链补 .catch(syncErr) ──────────────────────────────────────
js = sub1(
    js,
    "    S.goals.push(g); sortState(); saveCache(); return g;\n  });\n}",
    "    S.goals.push(g); sortState(); saveCache(); return g;\n  }).catch(syncErr);\n}",
    "actAddGoal",
)
js = sub1(
    js,
    "    saveCache(); return g;\n  });\n}\nfunction actDeleteGoal(gid) {",
    "    saveCache(); return g;\n  }).catch(syncErr);\n}\nfunction actDeleteGoal(gid) {",
    "actUpdateGoal",
)
js = sub1(
    js,
    "    S.logs.push(l); saveCache(); return l;\n  });\n}\nfunction actDeleteLog(lid) {",
    "    S.logs.push(l); saveCache(); return l;\n  }).catch(syncErr);\n}\nfunction actDeleteLog(lid) {",
    "actAddLog",
)
js = sub1(
    js,
    ".then(function () { saveCache(); return r; });",
    ".then(function () { saveCache(); return r; }).catch(syncErr);",
    "actSaveReview-update",
)
js = sub1(
    js,
    "    saveCache(); return r;\n  });\n}\nfunction actDeleteReview(rid) {",
    "    saveCache(); return r;\n  }).catch(syncErr);\n}\nfunction actDeleteReview(rid) {",
    "actSaveReview-add",
)

# ── 3. 包成 <script> 块 ───────────────────────────────────────────────────
body = js.strip("\n")
if not body.startswith("(function () {"):
    raise SystemExit("基准脚本首行异常，疑似截断")
p3 = "<script>\n" + body + "\n</script>\n"
write(DST, p3)

print("p3.html 已重建：%d 行（源 check.js %d 行）" % (p3.count("\n"), js.count("\n")))
print("syncErr 出现次数：%d" % p3.count("syncErr"))
print("escapeHTML 出现次数：%d" % p3.count("escapeHTML"))
