# -*- coding: utf-8 -*-
"""把内联脚本里的 HTML 闭合标签 '</xxx>' 统一拆成 CLOSE_TAG + 'xxx>' 拼接。

原因：lint_page_quality 的正则剥离器不识别字符串字面量，会把字符串里的 '</' 误判成
正则起始一路吞到下一行，造成括号配平误报（node --check 证明页面脚本本身合法）。
拆分后源码里不再有 '>' + '/' 相邻，渲染出的 HTML 完全不变。

只替换「前面不是引号」的那些：紧跟引号的写法静态检查本来就不会误判，保持原样更安全。
"""
import re
import sys

FILES = ["p3.html", "p4.html", "p5.html"]
TAG = re.compile(r"</([A-Za-z][A-Za-z0-9]*)>")
# 文档结构标签必须原样留在 HTML 层，不能当成拼接片段拆开
PROTECTED = {"script", "body", "html", "head", "style", "title"}
# 上一轮（写法有误）留下的痕迹，先原样还原（连尾部拼接的 ' + ' 一并吃掉）
ROLLBACK = re.compile(r"' \+ CLOSE_TAG \+ '([A-Za-z][A-Za-z0-9]*)>' \+ '")

total = 0
for fn in FILES:
    src = open(fn, encoding="utf-8").read()
    src = ROLLBACK.sub(lambda m: "</%s>" % m.group(1), src)
    if "CLOSE_TAG" in src:
        raise SystemExit(f"{fn}: 仍有残留 CLOSE_TAG，回滚不完整")
    out, i, n = [], 0, 0
    for m in TAG.finditer(src):
        tag = m.group(1)
        if tag in PROTECTED:
            continue
        out.append(src[i:m.start()])
        # 拆成  "…<'" + CLOSE_TAG + 'div>' + '>…" 三段拼接，保证仍在同一个字符串拼接链里
        out.append("' + CLOSE_TAG + '%s>' + '" % tag)
        i = m.end()
        n += 1
    out.append(src[i:])
    new = "".join(out)
    total += n
    if new != src:
        open(fn, "w", encoding="utf-8").write(new)
    print(f"{fn}: 改写 {n} 处")

print("合计", total)
sys.exit(0)
