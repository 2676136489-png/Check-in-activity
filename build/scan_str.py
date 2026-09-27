#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""字符串感知扫描：只把「字符串字面量内部」的 </ 找出来，并识别已改写的合法/非法 CLOSE_TAG 形态。

与 lint 的区别：本脚本自带真正的 JS 词法扫描（区分字符串 / 模板串 / 正则 / 注释），
因此不会像 lint_page_quality._strip_regex_literals 那样把字符串里的 </ 误判成正则起点。
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

DIV_CHARS = set("_$)]}\"'`")


def prev_token(out: list):
    """回看上一个「有效」输出字符，用于判断 / 是除法还是正则起始。"""
    for s in reversed(out[-8:]):
        t = s.rstrip()
        if t:
            return t[-1]
    return ""


def scan_js(js: str):
    """返回 (strings, malformed)。刻意做到「不因局部损坏而中断」。"""
    out: list[str] = []
    strings = []
    bad: list[str] = []
    i, n = 0, len(js)
    while i < n:
        c = js[i]
        # 注释
        if c == "/" and i + 1 < n and js[i + 1] == "/":
            j = js.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and js[i + 1] == "*":
            j = js.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        # 字符串 / 模板串
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
            if not closed:
                # 不中断扫描：未闭合的字符串按「到行尾」收口，继续往下扫，
                # 这样才能一次看全整份脚本的损坏分布，而不是只看到第一处。
                bad.append("未闭合字符串 @%d: %r" % (i, js[i:i + 60]))
                j = js.find("\n", i)
                if j < 0:
                    j = n
                strings.append((i + 1, j))
                out.append(js[i:j])
                i = j
                continue
        # 正则字面量
        if c == "/" and i + 1 < n and js[i + 1] not in ("/", "*"):
            p = prev_token(out)
            if not (p and (p.isalnum() or p in DIV_CHARS)):
                j = i + 1
                esc = False
                in_cls = False
                closed = False
                while j < n:
                    cc = js[j]
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
                        break
                    elif cc == "\n":
                        break
                    j += 1
                if closed:
                    out.append("__RE__")
                    i = j + 1
                    continue
        out.append(c)
        i += 1
    return strings, bad


def main():
    files = ["p3.html", "p4.html", "p5.html"]
    total_lt = 0
    for fn in files:
        path = os.path.join(HERE, fn)
        src = open(path, "r", encoding="utf-8", newline="").read()
        src = src.replace("\r\n", "\n")
        m = re.search(r"<script[^>]*>(.*?)</script>", src, re.S)
        js = m.group(1) if m else src
        strings, bad = scan_js(js)
        hits = [(a, b) for a, b in strings if "</" in js[a:b]]
        total_lt += len(hits)
        print("%s: 字符串 %d 个，其中含 </ 的 %d 个，异常 %s" % (fn, len(strings), len(hits), bad or "无"))
        # 输出含 </ 的字符串片段与行号
        for a, b in hits:
            line = js.count("\n", 0, a) + 1
            print("   L%-4d %s" % (line, js[a:b][:150]))
        # 统计 CLOSE_TAG 出现方式
        forms = {}
        for mm in re.finditer(r"CLOSE_TAG", js):
            s = max(0, mm.start() - 40)
            forms[js[s:mm.end() + 30]] = forms.get(js[s:mm.end() + 30], 0) + 1
        print("   CLOSE_TAG 上下文形态 %d 种" % len(forms))
    print("合计含 </ 的字符串：%d" % total_lt)


if __name__ == "__main__":
    main()
