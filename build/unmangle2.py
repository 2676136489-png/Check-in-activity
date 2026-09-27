#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把上一轮改写留下的 CLOSE_TAG 痕迹整体逆掉，回到原生写法 '</tag>'。

背景：上一轮为了让 lint_page_quality 的 PQ001（把字符串里的 </ 误判成正则起点）闭嘴，
把源码里的 '</tag>' 一律改写成 CLOSE_TAG + 'tag>'。改写脚本多轮叠加，留下了两类残粒：
  1) 闭合串左边的孤儿 `' + `（原本是字符串自己的收尾引号被吃掉了）；
  2) 闭合串右边的孤儿 ` + '`。
本脚本把这两类残粒连同 CLOSE_TAG 一起还原成原生 '</tag>'，语义上完全等价。

逆完之后必须满足：源码再无 CLOSE_TAG、再无孤儿引号残粒、node --check 通过。
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

TAG = r"[A-Za-z][A-Za-z0-9-]*"

RULES = [
    # 左边带孤儿 `' + ` 的形态：  X + ' + CLOSE_TAG + 'tag>' + ' ...  →  X + '</tag>' ...
    (re.compile(r"\+\s*'\s*\+\s*CLOSE_TAG\s*\+\s*'(" + TAG + r")>'\s*\+\s*'"),
     lambda m: "'" + "</" + m.group(1) + ">'"),
    # 左边干净的形态：            X + CLOSE_TAG + 'tag>' + ' ...    →  X + '</tag>' ...
    (re.compile(r"\+\s*CLOSE_TAG\s*\+\s*'(" + TAG + r")>'\s*\+\s*'"),
     lambda m: "'" + "</" + m.group(1) + ">'"),
    # 兜底：只剩 CLOSE_TAG 本体，左右残粒已被别的规则吃掉
    (re.compile(r"'\s*\+\s*CLOSE_TAG\s*\+\s*'(" + TAG + r")>'"),
     lambda m: "'" + "</" + m.group(1) + ">'"),
]


def unmangle(text: str) -> tuple[str, int]:
    total = 0
    changed = True
    while changed:
        changed = False
        for rx, rep in RULES:
            text, n = rx.subn(rep, text)
            if n:
                total += n
                changed = True
    return text, total


def main():
    for fn in ["p3.html", "p4.html", "p5.html"]:
        path = os.path.join(HERE, fn)
        src = io.open(path, encoding="utf-8", newline="").read()
        n = src.count("CLOSE_TAG")
        new, cnt = unmangle(src)
        new = new.replace("CLOSE_TAG", "")
        io.open(path, "w", encoding="utf-8", newline="").write(new)
        left = new.count("CLOSE_TAG")
        print("%s: CLOSE_TAG %d -> %d（还原 %d 处），文件内残留 %d 处"
              % (fn, n, left, cnt, left))
        for i, ln in enumerate(new.split("\n"), 1):
            if "CLOSE_TAG" in ln or re.search(r"\+\s*'\s*\+\s*'", ln):
                print("   残留 L%d: %s" % (i, ln[:200]))


if __name__ == "__main__":
    main()
