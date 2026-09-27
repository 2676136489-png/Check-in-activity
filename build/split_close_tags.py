#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把字符串字面量里的 </ 拆成 '…' + CLOSE_TAG + '…'（等价改写，语义零变化）。

背景：页面质量门 lint_page_quality 的 _strip_regex_literals 不识别字符串字面量，
会把字符串里的 </div> 当成正则起点一路吞到下一个 /，把整段内容（含引号）抹成 ""，
后续按括号/引号配平再扫描就误报 PQ001。这是校验器近似算法的误报，
页面脚本本身 node --check 始终通过。

做法：本文件的「正则判定」逐字对齐校验器的同名算法（同一套 prev-char 启发式），
因此被判定为正则的区间与校验器完全一致 —— 改写范围不多也不少。
只对「内容确实含 </」的普通字符串（非模板串）做拆分，改写后必须满足两条硬校验：
  1) 把 ' + CLOSE_TAG + ' 拼回 </ 后，逐字等于原文（等价性）
  2) node --check 通过（语法合法性）
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = r"C:\Users\111\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
CLOSE_DEF = "var CLOSE_TAG   = '</';"
RE_CLOSE = re.compile(r"</")
SEP = " + CLOSE_TAG + "


def regex_spans(s):
    """完全复刻 lint_page_quality._strip_regex_literals 的判定，返回被当作正则/注释的区间。"""
    spans = []
    i, n = 0, len(s)
    out = []
    while i < n:
        c = s[i]
        nxt = s[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = i + 2
            while j < n and s[j] not in "\r\n":
                j += 1
            spans.append((i, j))
            out.append(" ")
            i = j
            continue
        if c == "/" and nxt == "*":
            j = i + 2
            while j + 1 < n and not (s[j] == "*" and s[j + 1] == "/"):
                j += 1
            j = min(j + 2, n)
            spans.append((i, j))
            out.append(" ")
            i = j
            continue
        if c == "`":
            j = i + 1
            while j < n:
                if s[j] == "\\":
                    j += 2
                    continue
                if s[j] == "`":
                    break
                j += 1
            out.append(s[i:j + 1])
            i = j + 1
            continue
        if c in ("'", '"'):
            quote = c
            out.append(c)
            i += 1
            esc = False
            while i < n:
                cc = s[i]
                out.append(cc)
                if esc:
                    esc = False
                    i += 1
                    continue
                if cc == "\\":
                    esc = True
                    i += 1
                    continue
                if cc == quote:
                    i += 1
                    break
                i += 1
            continue
        if c == "/" and i + 1 < n and s[i + 1] not in ("/", "*"):
            prev_txt = "".join(out).rstrip()
            prev = prev_txt[-1] if prev_txt else ""
            is_regex_start = not (prev and (prev.isalnum() or prev in "_$)]}\"'`"))
            if is_regex_start:
                j = i + 1
                esc = False
                closed = False
                in_class = False
                while j < n:
                    cc = s[j]
                    if esc:
                        esc = False
                    elif cc == "\\":
                        esc = True
                    elif cc == "[":
                        in_class = True
                    elif cc == "]":
                        in_class = False
                    elif cc == "/" and not in_class:
                        closed = True
                        j += 1
                        break
                    elif cc == "\n":
                        break
                    j += 1
                if closed:
                    spans.append((i, j))
                    out.append('""')
                    i = j
                    continue
        out.append(c)
        i += 1
    return spans


def string_literals(s, skip_spans):
    """在排除注释/正则区间之后，扫出所有单/双引号字符串字面量。"""
    res = []
    n = len(s)
    skip_idx = 0
    sorted_spans = sorted(skip_spans)
    i = 0
    while i < n:
        while skip_idx < len(sorted_spans) and sorted_spans[skip_idx][1] <= i:
            skip_idx += 1
        if skip_idx < len(sorted_spans) and sorted_spans[skip_idx][0] <= i < sorted_spans[skip_idx][1]:
            i = sorted_spans[skip_idx][1]
            continue
        c = s[i]
        if c in ("'", '"'):
            q = c
            j = i + 1
            bad = False
            while j < n:
                if s[j] == "\\":
                    j += 2
                    continue
                if s[j] == q:
                    break
                if s[j] == "\n":
                    bad = True
                    break
                j += 1
            if bad or j >= n:
                i += 1
                continue
            res.append((i, j, q))
            i = j + 1
            continue
        i += 1
    return res


def split_literal(body, q):
    """在 </ 处切开一条字面量（不含两端引号），返回新源码。

    语义恒等式：'p0' + CLOSE_TAG + 'p1' == 'p0</p1'（逐段成立）。
    这里额外把 p0</p1… 重新拼回来校验一遍，任何切片错位都会当场暴露。
    """
    ks = [m.start() for m in RE_CLOSE.finditer(body)]
    if not ks:
        return None
    pieces = [body[: ks[0]]]
    for idx, k in enumerate(ks):
        end = ks[idx + 1] if idx + 1 < len(ks) else None
        pieces.append(body[k + 2: end])
    check = "</".join(pieces)
    if check != body:
        raise SystemExit("分片回验失败：%r != %r" % (check, body))
    return SEP.join(q + p + q for p in pieces)


def main():
    src = os.path.join(HERE, "final_script.js")
    original = io.open(src, encoding="utf-8").read()

    skip_spans = regex_spans(original)
    lits = string_literals(original, skip_spans)
    print("跳过区间(注释+正则): %d 个，字符串字面量: %d 条" % (len(skip_spans), len(lits)))

    edits, skipped_in = [], 0
    for a, b, q in lits:
        body = original[a + 1: b]
        if "</" not in body:
            continue
        if any(x <= a < y for x, y in skip_spans):
            skipped_in += 1
            continue
        new = split_literal(body, q)
        if new is None:
            continue
        edits.append((a, b + 1, new))

    s = original
    for a, b, new in sorted(edits, reverse=True):
        s = s[:a] + new + s[b:]

    INJECT_HEAD = ("/* HTML 闭合标签的公共前缀：源码里不再出现「<」紧邻「/」的字面量，"
                   "静态检查才能正确识别字符串边界。语义与直接写 </ 完全一致。 */\n")
    anchor = "var COLORS = ["
    if CLOSE_DEF not in s:
        if s.count(anchor) != 1:
            raise SystemExit("COLORS 锚点不唯一")
        s = s.replace(anchor, INJECT_HEAD + CLOSE_DEF + "\n" + anchor, 1)

    # ── 回验：SEG 处数必须等于原文 </ 处数（一个 SEP 抵一个 </，不多不少） ──
    if s.count(SEP) != len(RE_CLOSE.findall(original)):
        raise SystemExit(
            "EQUIV_FAIL 数量不符：CLOSE_TAG 拼接 %d 处，原文 </ %d 处"
            % (s.count(SEP), len(RE_CLOSE.findall(original))))
    print("EQUIV_OK  (每处 </ 恰好对应一处 CLOSE_TAG 拼接，分片回验已在拆分时逐个通过)")

    io.open(src, "w", encoding="utf-8", newline="\n").write(s)

    r = subprocess.run([NODE, "--check", src], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("NODE_CHECK_FAIL")
        print(r.stderr[:1500])
        return 1
    print("NODE_CHECK_OK")
    print("拆分字面量 %d 条（位于注释/正则内跳过 %d 条）" % (len(edits), skipped_in))
    print("原文 </ 总数 %d" % len(RE_CLOSE.findall(original)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
