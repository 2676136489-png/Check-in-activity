# -*- coding: utf-8 -*-
"""把 p1(CSS) + p2(骨架) + final_script.js 合并成最终的 学习目标管理台.html（统一 LF）。

final_script.js 由 build_script.py 从干净基准 check.js 生成（含草稿层 / 同步出口 / 转义收口），
p3~p5 是它拆分过程中的中间片段，已废弃，不再参与合并。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "学习目标管理台.html")


def rd(name):
    with open(os.path.join(HERE, name), "rb") as f:
        return f.read().replace(b"\r\n", b"\n")


buf = [rd("p1.html"), rd("p2.html"), b"<script>\n", rd("final_script.js"), b"</script>\n"]
with open(OUT, "wb") as f:
    f.write(b"".join(buf))
print("merged ->", OUT, os.path.getsize(OUT), "bytes")
