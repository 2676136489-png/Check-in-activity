#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清掉逆转换后残留的孤儿引号片段（deslag = de-slagging）。

上一轮改写脚本在字符串边界上反复增删引号，留下了三类「看起来像拼接、实际是残粒」的形态：
  a)  X + '">' '</span>'      —— 前一个字符串没收尾就贴上下一个（相邻字符串字面量，语法错）
  b)  '</span>' + ' + ''      —— 多出来的 '+ '' 残粒（会把字面文本 " + " 拼进 HTML）
  c)  ) +  + 'div>'           —— 闭合标签的 '<' 被吃掉了，且多出一个加号
  d)  html ' + ' + ' + '</div>' —— 逆/正变换来回叠加时多出来的 '+ ' 链

判定依据（关键）：只有「前一个字符是字符串的收尾引号 ' 或 "」时，紧跟其后的那个引号才是孤儿；
若前一个字符是 '+' / '(' / ','，那是一个独立的字符串字面量，必须保留原样。
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TAG = r"[A-Za-z][A-Za-z0-9-]*"
CT = r"</" + TAG + r">"


def _A(m):
    """X' '</tag>'  ->  X' + '</tag>'"""
    return m.group(1) + " + '" + m.group(2) + "'"


def _C(m):
    """ +  + 'tag>'  ->  + '</tag>'"""
    return " + '" + "</" + m.group(1) + ">'"


def _D(m):
    """...' + ' + ... + '</tag>'  ->  ...'</tag>'（反复收敛，把多出来的 '+ ' 链压回去）"""
    return "'" + m.group(1) + "'"


RULES = [
    # d) 先压 '+ ' 链（要求前一个是引号，避免误伤正常的 + '</div>'）
    (re.compile(r"'(\s*\+\s*')+(" + CT + r")'"), _D),
    # a) 前一个字符串没收尾就贴了闭合标签
    (re.compile(r'(")\s*(' + CT + r")'"), _A),
    # c) 闭合标签丢了 '<'，且多出一个加号
    (re.compile(r"\s\+\s*\+\s*'(" + TAG + r")>'"), _C),
    # b) 闭合标签后面多出的 "+ ''" 残粒
    (re.compile(r"(" + CT + r")'\s*\+\s*'\s*\+\s*''"),
     lambda m: m.group(1) + "' + ''"),
]


def clean(text: str):
    total = 0
    changed = True
    rounds = 0
    while changed and rounds < 12:
        changed = False
        rounds += 1
        for rx, rep in RULES:
            text, n = rx.subn(rep, text)
            if n:
                total += n
                changed = True
    return text, total


def main():
    only = sys.argv[1:] or ["p3.html", "p4.html", "p5.html"]
    for fn in only:
        path = os.path.join(HERE, fn)
        src = io.open(path, encoding="utf-8", newline="").read()
        new, n = clean(src)
        if new != src:
            io.open(path, "w", encoding="utf-8", newline="").write(new)
        print("%s: 清理 %d 处" % (fn, n))


if __name__ == "__main__":
    main()
