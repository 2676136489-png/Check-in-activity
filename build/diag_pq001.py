#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复算 lint_page_quality 的 PQ001 逻辑，定位「括号 ')' 多余」的确切位置。"""
import io
import os
import re
import sys

sys.path.insert(0, r"C:\Users\111\.workbuddy\plugins\cache\workbuddy-builtin\skill-library\5.6.2-wb.39298511.g37a65c0b.he233403f909a\page")
import lint_page_quality as L  # noqa: E402

HTML = r"C:\Users\111\WorkBuddy\2026-09-27-16-40-45\学习目标管理台.html"

html = io.open(HTML, encoding="utf-8").read()
scripts = L._extract_inline_scripts(html)
raw = scripts[0]
js = L._strip_regex_literals(L._strip_comments(raw))

depth = {"(": 0, "[": 0, "{": 0}
pairs = {")": "(", "]": "[", "}": "{"}
opens = {}
i, n = 0, len(js)
while i < n:
    c = js[i]
    if c in ("'", '"', "`"):
        q = c
        i += 1
        esc = False
        closed = False
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
            print("UNCLOSED STRING near offset", i)
            print(repr(js[max(0, i - 300):i + 100]))
            break
        continue
    if c in depth:
        if depth[c] == 0:
            opens[c] = i
        depth[c] += 1
    elif c in pairs:
        depth[pairs[c]] -= 1
        if depth[pairs[c]] < 0:
            s = max(0, i - 400)
            print("=== depth goes negative at offset %d (char %r) ===" % (i, c))
            print("--- context ---")
            print(repr(js[s:i + 200]))
            break
    i += 1

print("最终括号深度:", depth)
print("未闭合的 '(' 起始偏移:", opens.get("("))
if opens.get("(") is not None:
    s = max(0, opens["("] - 500)
    print(repr(js[s:opens["("] + 300]))
