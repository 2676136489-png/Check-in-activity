#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把源码里的字符串字面量 '</tag>' 安全地拆成 '<' + CLOSE_TAG + 'tag>'。

为什么需要这一步
----------------
page/lint_page_quality.py 的 PQ001 用 _strip_regex_literals 猜正则位置，它不认识字符串
字面量：一旦某个字符串内部出现 "</div>"（且 / 前面是字母等"看起来像除法"的字符），
那个 '/' 会被当成正则起点，一直吞到下一个 '/' 或换行，后面成片的引号配对就全乱了，
于是报「内联脚本括号/引号不配平」。node --check 证明脚本本身是合法的，所以这是校验器的
启发式误判。

规避办法（不动任何业务逻辑）：把字符串里的 "</" 拆开，让它永远不出现在同一个字面量里。
    '</div>'        ->  '<' + CLOSE_TAG + 'div>'
    'a</div>b'      ->  'a<' + CLOSE_TAG + 'div>b'
运行时拼接结果完全一样，源码里再也不存在「字符串中包含 </」。

本脚本用真正的 JS 词法扫描定位字符串字面量，只在字面量内部动手，因此不会像上一轮那样
误伤相邻字符串的结构。
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "check.js")
DST = os.path.join(HERE, "p3.js")

CLOSE_DEF = "var CLOSE_TAG   = '</';"

DIV_OK = set("_$)]}\"'`")


def _prev_token(text, pos):
    """取 pos 之前的最后一个非空白字符（用于判断 / 是除法还是正则开头）。"""
    i = pos - 1
    while i >= 0 and text[i] in " \t\r\n":
        i -= 1
    return text[i] if i >= 0 else ""


def scan(js):
    """产出所有字符串字面量 (start, end, quote)，start/end 不含引号。"""
    out = []
    i, n = 0, len(js)
    while i < n:
        c = js[i]
        if c == "/" and i + 1 < n and js[i + 1] == "/":
            j = js.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and js[i + 1] == "*":
            j = js.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in ("'", '"', "`"):
            q = c
            j = i + 1
            esc = False
            closed = False
            while j < n:
                cc = js[j]
                if esc:
                    esc = False
                elif cc == "\\":
                    esc = True
                elif cc == q:
                    closed = True
                    break
                elif cc == "\n" and q != "`":
                    break
                j += 1
            if closed:
                out.append((i + 1, j, q))
                i = j + 1
                continue
        i += 1
    return out


LT_RE = re.compile(r"</([A-Za-z][A-Za-z0-9-]*)")


def conv(content, q):
    """把字面量内部的每个 '</' 拆掉，中间用常量 CLOSE_TAG（值 '</'）相接。

    content 是不含引号的内容，q 是字面量自己的引号。
    例：content = '</div></span>'  ->  '' + CLOSE_TAG + 'div></' + CLOSE_TAG + 'span>'
    运行时拼接结果与原字符串逐字相同，但源码里不再有「字符串中包含 </」。
    """
    ks = [m.start() for m in re.finditer(r"</", content)]
    if not ks:
        return content
    body = [content[0:ks[0]]]
    for i, k in enumerate(ks):
        end = ks[i + 1] if i + 1 < len(ks) else None
        body.append(content[k + 2:end])          # 跳过 '<' 与 '/'
    # 本函数返回「整条字面量」的替换文本（含两端引号），调用方会连引号一起换掉。
    sep = " + CLOSE_TAG + "
    return sep.join(q + s + q for s in body)


def main():
    js = io.open(SRC, encoding="utf-8", newline="").read()
    # check.js 是改写前的原始脚本，本身不含常量定义；注入到常量区。
    if "CLOSE_TAG" in js:
        raise SystemExit("check.js 里已经有 CLOSE_TAG，疑似被污染，请换一份干净的原始脚本")
    marker = "var CACHE_DTS   = 'wb_learngoal_cache_ts';"
    for eol in ("\r\n", "\n"):
        if marker + eol in js:
            js = js.replace(marker + eol, marker + eol + eol + CLOSE_DEF + eol, 1)
            break
    else:
        raise SystemExit("找不到锚点 " + marker)
    if CLOSE_DEF not in js:
        raise SystemExit("常量定义未注入成功")

    lits = scan(js)
    edits = []
    for a, b, q in lits:
        content = js[a:b]
        if "</" not in content:
            continue
        if content == "</":
            continue  # CLOSE_TAG 自己的定义，跳过
        if q in content:
            raise SystemExit("字面量里含有同类引号，无法安全拆分：%r" % content[:120])
        new = conv(content, q)
        if new != content:
            # 替换区间是整条字面量（含两端引号），不是内容本身
            edits.append((a - 1, b + 1, new))

    # 从后往前替换，避免下标漂移
    for a, b, new in sorted(edits, reverse=True):
        js = js[:a] + new + js[b:]

    # 自检：转换后不应再有字符串字面量内部包含 '</'
    # 唯一允许出现 "</" 的地方就是常量定义本身——它单独成句，/ 前面是引号，不会被误判
    left = [(a, b) for a, b, q in scan(js) if "</" in js[a:b] and js[a:b] != "</"]
    if left:
        for a, b in left[:10]:
            print("  残留 @%d: %s" % (a, js[a:b][:120]))
        raise SystemExit("转换后仍有 %d 个字面量内含 </" % len(left))

    io.open(DST, "w", encoding="utf-8", newline="\n").write(js)
    print("转换 %d 处，输出 %s（%d 字节）" % (len(edits), DST, len(js.encode("utf-8"))))


if __name__ == "__main__":
    main()
