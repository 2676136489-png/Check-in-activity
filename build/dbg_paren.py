# -*- coding: utf-8 -*-
"""复刻 lint_page_quality 的 _check_js_syntax，输出失衡点的精确偏移与上下文。"""
import re
import sys
from importlib import machinery
from importlib import util as importlib_util

LINT = (r"C:\Users\111\.workbuddy\plugins\cache\workbuddy-builtin\skill-library"
        r"\5.6.2-wb.39298511.g37a65c0b.he233403f909a\page\lint_page_quality.py")

spec = importlib_util.spec_from_file_location("lpq", LINT)
lpq = importlib_util.module_from_spec(spec)
spec.loader.exec_module(lpq)

html = open(sys.argv[1], encoding="utf-8").read()
scripts = lpq._extract_inline_scripts(html)
print("inline scripts:", len(scripts))

for idx, raw in enumerate(scripts):
    js = lpq._strip_regex_literals(lpq._strip_comments(raw))
    depth = {"(": 0, "[": 0, "{": 0}
    pairs = {")": "(", "]": "[", "}": "{"}
    i, n = 0, len(js)
    line = 1
    colstart = 0
    events = []
    broken = False
    while i < n:
        c = js[i]
        if c == "\n":
            line += 1
            colstart = i + 1
            i += 1
            continue
        if c in ("'", '"', "`"):
            q = c
            i += 1
            esc = False
            closed = False
            st = i
            while i < n:
                cc = js[i]
                if esc:
                    esc = False
                elif cc == "\\":
                    esc = True
                elif cc == q:
                    closed = True
                    i += 1
                    break
                i += 1
            if not closed:
                print(f"script#{idx+1} UNCLOSED STRING at offset {st} line {line}")
                print(repr(js[max(0, st - 200):st + 200]))
                broken = True
                break
            continue
        if c in depth:
            depth[c] += 1
            events.append((i, line, c, +1, dict(depth)))
        elif c in pairs:
            depth[pairs[c]] -= 1
            events.append((i, line, c, -1, dict(depth)))
            if depth[pairs[c]] < 0:
                print(f"script#{idx+1} EXTRA '{c}' at offset {i} line {line} (base offset +{sum(len(scripts[:idx]))})")
                print(repr(js[max(0, i - 250):i + 250]))
                broken = True
                break
        i += 1
    if broken:
        continue
    if any(v != 0 for v in depth.values()):
        print(f"script#{idx+1} UNBALANCED at end: {depth}")
        # 关键：当 ')' 把 depth 打到 -1 → 这就是多出来的 ')'（吃掉了更外层的 '('）
        d = 0
        for ev in events:
            if ev[2] == "(":
                d += 1
            elif ev[2] == ")":
                d -= 1
                if d < 0:
                    print(f"  EXTRA ')' at offset {ev[0]} line {ev[1]} (depth before={d + 1})")
                    print("  ctx:", repr(js[max(0, ev[0] - 400):ev[0] + 150]))
                    d = 0
