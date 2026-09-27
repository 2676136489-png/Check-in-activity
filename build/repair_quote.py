# -*- coding: utf-8 -*-
"""把第二次改写留下的双重拼接痕迹规范化成单份。

错版在闭合标签处留下的样子（两种形态，统一收敛成一种）：
    标签在字符串开头： '<div>'' + ' + CLOSE_TAG + 'div>' + ' + ''
    标签在字符串段中： '<div>' + ' + CLOSE_TAG + 'div>' + ' + ''
正确写法应当只留一份边界引号：
    开头形态 -> '' + CLOSE_TAG + 'div>' + '   （外层的 ' 是本字符串的起引号）
    段中形态 -> CLOSE_TAG + 'div>' + '        （外层的 ' 是上一字符串的收引号）
"""
import re
import sys

FILES = ["p3.html", "p4.html", "p5.html"]
RX = re.compile(r"'\s\+\sCLOSE_TAG \+ '([A-Za-z][A-Za-z0-9]*)>'")

for fn in FILES:
    src = open(fn, encoding="utf-8", newline="").read()
    new, n = RX.subn(lambda m: "CLOSE_TAG + '%s>'" % m.group(1), src)
    print(fn, "规范化", n, "处")
    if new != src:
        open(fn, "w", encoding="utf-8", newline="").write(new)
    if n == 0:
        sys.exit(0)
