# -*- coding: utf-8 -*-
"""对比 lint 的朴素扫描与正确扫描，输出首个分歧点的上下文。"""
import re
from importlib import util as importlib_util

LINT = (r"C:\Users\111\.workbuddy\plugins\cache\workbuddy-builtin\skill-library"
        r"\5.6.2-wb.39298511.g37a65c0b.he233403f909a\page\lint_page_quality.py")
spec = importlib_util.spec_from_file_location("lpq", LINT)
lpq = importlib_util.module_from_spec(spec)
spec.loader.exec_module(lpq)

import os
raw = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "extracted.js"),
           encoding="utf-8").read()


def naive_depth(js):
    """lint 的朴素扫描：只跳过注释与字符串，其余全当代码。"""
    js = lpq._strip_regex_literals(lpq._strip_comments(js))
    depth = {"(": 0, "[": 0, "{": 0}
    pairs = {")": "(", "]": "[", "}": "{"}
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
                return None
            continue
        if c in depth:
            depth[c] += 1
        elif c in pairs:
            depth[pairs[c]] -= 1
        i += 1
    return depth


def correct_depth(js):
    """正确扫描：注释 / 字符串 / 正则字面量都正确识别。"""
    depth = {"(": 0, "[": 0, "{": 0}
    pairs = {")": "(", "]": "[", "}": "{"}
    i, n = 0, len(js)
    line = 1
    while i < n:
        c = js[i]
        nxt = js[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = i + 2
            while j < n and js[j] not in "\r\n":
                j += 1
            i = j
            continue
        if c == "/" and nxt == "*":
            j = i + 2
            while j + 1 < n and not (js[j] == "*" and js[j + 1] == "/"):
                j += 1
            i = min(j + 2, n)
            continue
        if c in ("'", '"', "`"):
            q = c
            i += 1
            esc = False
            while i < n:
                cc = js[i]
                if cc == "\n" and q != "`":
                    break
                if esc:
                    esc = False
                elif cc == "\\":
                    esc = True
                elif cc == q:
                    i += 1
                    break
                i += 1
            continue
        if c == "/" and i + 1 < n and js[i + 1] != "/":
            # 正则起始判定
            j = js[:i].rstrip()
            prev = j[-1] if j else ""
            is_regex = not (prev and (prev.isalnum() or prev in "_$)]}\"'`"))
            if is_regex:
                p = i + 1
                esc = False
                in_cls = False
                closed = False
                while p < n:
                    cc = js[p]
                    if esc:
                        esc = False
                    elif cc == "\\":
                        esc = True
                    elif cc == "[":
                        in_cls = True
                    elif cc == "]":
                        in_cls = False
                    elif cc == "/" and not in_cls:
                        closed = True
                        p += 1
                        break
                    p += 1
                if closed:
                    i = p
                    continue
        if c == "\n":
            line += 1
        if c in depth:
            depth[c] += 1
        elif c in pairs:
            depth[pairs[c]] -= 1
        i += 1
    return depth


d1 = naive_depth(raw)
d2 = correct_depth(raw)
print("naive  :", d1)
print("correct:", d2)

# 逐字符比对首个分歧
js1 = lpq._strip_regex_literals(lpq._strip_comments(raw))
print("naive len", len(js1), "raw len", len(raw))
for k in range(min(len(js1), len(raw))):
    if js1[k] != raw[k]:
        print(f"first divergence at raw offset {k}: naive={js1[k]!r} raw={raw[k]!r}")
        print("ctx raw:", repr(raw[max(0, k - 300):k + 200]))
        break
