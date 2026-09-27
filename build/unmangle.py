# -*- coding: utf-8 -*-
"""把 fix_close_tag 前一版写错的拼接痕迹还原回 '</xxx>' 字面量。

错版把每个闭合标签替换成：
    ' + CLOSE_TAG + 'xxx>' + '      （标签位于字符串开头时前面还会多一个 '' + '）
本脚本把这些痕迹整体吃回 '</xxx>'，反复迭代直到稳定。
"""
import re
import sys

FILES = ["p3.html", "p4.html", "p5.html"]
RULES = [
    # 完整的两段拼接（标签在字符串开头）
    re.compile(r"'' \+ ' \+ CLOSE_TAG \+ '([A-Za-z][A-Za-z0-9]*)>' \+ ' \+ '"),
    # 完整的单段拼接（标签在字符串中段）
    re.compile(r"' \+ CLOSE_TAG \+ '([A-Za-z][A-Za-z0-9]*)>' \+ ' \+ '"),
    # 上一版更简单写法残留
    re.compile(r"CLOSE_TAG \+ '([A-Za-z][A-Za-z0-9]*)>'"),
]

for fn in FILES:
    src = open(fn, encoding="utf-8", newline="").read()
    for _ in range(20):
        changed = False
        for rx in RULES:
            src, n = rx.subn(lambda m: "</%s>" % m.group(1), src)
            if n:
                changed = True
        if not changed:
            break
    open(fn, "w", encoding="utf-8", newline="").write(src)
    bad = [(i, l) for i, l in enumerate(src.splitlines(), 1)
           if "CLOSE_TAG" in l and "var CLOSE_TAG" not in l and "CLOSE_TAG + " not in l]
    if bad:
        for i, l in bad:
            print(f"{fn}:{i}: {l[:160]}")
        sys.exit(1)
    print(f"{fn}: 已还原")
