#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列出所有「需要手修」的行：源文件里出现 </ 的行，排除 CLOSE_TAG 定义行。

判定规则：
  - 只有 `var CLOSE_TAG   = '</';` 这一行允许出现裸的 "</ ；
  - 其余出现 </ 的行一律打印出来，人工/脚本判定是「已改写的合法形态」还是「被改坏的形态」。
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_RE = re.compile(r"^\s*var\s+CLOSE_TAG\s*=\s*'</\s*';\s*$")

CANON_RE = re.compile(r"""'\s*\+\s*CLOSE_TAG\s*\+\s*'([A-Za-z][A-Za-z0-9-]*)>'""")


def main():
    bad = 0
    for fn in ["p3.html", "p4.html", "p5.html"]:
        path = os.path.join(HERE, fn)
        src = open(path, "r", encoding="utf-8", newline="").read().replace("\r\n", "\n")
        lines = src.split("\n")
        print("=" * 20 + " " + fn)
        for i, ln in enumerate(lines, 1):
            if "</" not in ln:
                continue
            if DEF_RE.match(ln):
                continue
            # 统计该行里 </ 的出现次数，全部必须是「' + CLOSE_TAG + 'x>'」这种已改写形态
            rest = ln
            canon = 0
            while True:
                m = CANON_RE.search(rest)
                if not m:
                    break
                canon += 1
                rest = rest[m.end():]
            n_lt = ln.count("</") - (1 if "</" in ln.split("CLOSE_TAG")[0] and False else 0)
            # 已改写成功的次数：每处 '</x>' -> CLOSE_TAG + 'x>'，所以 '</' 计数应等于 canon
            ok = ("CLOSE_TAG" in ln) and (rest.strip() == "" or re.fullmatch(r"\s*", rest))
            if not ok:
                bad += 1
                print("L%-5d [%s]" % (i, ln[:400]))
    print("疑似损坏行数：%d" % bad)


if __name__ == "__main__":
    main()
