#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证「闭合标签改写」是纯机械变换，运行时语义逐字不变。

做法：把改写后的脚本里所有的 " + CLOSE_TAG + " 拼回 "</"，
应当恰好等于改写前的原始脚本（check.js）。只要逐字相同，就证明
改写只在字符串边界上加了一层常量拼接，没有改动任何业务文本。
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))

orig = io.open(os.path.join(HERE, "check.js"), encoding="utf-8", newline="").read()
new = io.open(os.path.join(HERE, "p3.js"), encoding="utf-8", newline="").read()

# 常量定义是我们新注入的，比较前先从改写稿里摘掉
def _strip_def(t):
    """摘掉新注入的常量定义行（连同我们多插的那个空行），还原成原始形态。"""
    for d in ("var CLOSE_TAG   = '</';\r\n\r\n", "var CLOSE_TAG   = '</';\r\n",
              "var CLOSE_TAG   = '</';\n\n", "var CLOSE_TAG   = '</';\n"):
        t = t.replace(d, "")
    return t

new_no_def = _strip_def(new)

back = new_no_def.replace(" + CLOSE_TAG + ", "</")

if back == orig:
    print("EQUIV_OK：改写后可逆还原，与原脚本逐字一致（%d 字符）" % len(back))
else:
    print("EQUIV_FAIL：还原后与原脚本不一致")
    # 定位第一处差异
    for i in range(min(len(back), len(orig))):
        if back[i] != orig[i]:
            print("  首个差异 @%d" % i)
            print("  改写稿：%r" % back[max(0, i - 60):i + 60])
            print("  原始稿：%r" % orig[max(0, i - 60):i + 60])
            break
    else:
        print("  长度不同：back=%d orig=%d" % (len(back), len(orig)))
        print("  改写稿尾部：%r" % back[-120:])
        print("  原始稿尾部：%r" % orig[-120:])
    raise SystemExit(1)
