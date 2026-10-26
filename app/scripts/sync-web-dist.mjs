// 把 app/dist 的构建产物同步到仓库根的 web-dist/（WorkBuddy 的发布目录）。
//
// 存在的理由：工程有两个线上入口，但只有 GitHub Pages 是自动的。WorkBuddy
// 那边发布的是 web-dist/ 目录，如果只在 app/ 改了代码、npm run build 之后
// 忘了同步，线上就会停在旧版本 —— 而本地一切正常，很难察觉。
// 这个脚本把「build 之后还要拷一次」这件事变成一条命令，并且拷贝完做三项
// 校验，任何一项不过就直接退出非 0。
//
// 用法：cd app && npm run pub:sync

import { existsSync, rmSync, mkdirSync, copyFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const distDir = join(appDir, 'dist')
const outDir = resolve(appDir, '..', 'web-dist')

// 不用 fs.cpSync：Node 22 在部分 Windows 环境下递归复制会直接把进程打崩
// （退出码 127，无堆栈无输出）。readdir + copyFileSync 走的是另一条路径，稳定。
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dst, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else copyFileSync(from, to)
  }
}

function fail(msg) {
  console.error(`\n[失败] ${msg}`)
  process.exit(1)
}

// 校验 1：源产物存在
if (!existsSync(join(distDir, 'index.html'))) {
  fail(`找不到 ${join(distDir, 'index.html')}，先跑 npm run build`)
}

// 目录名必须正好是 web-dist，防止路径算错时把别的目录删掉
if (basename(outDir) !== 'web-dist') {
  fail(`目标目录不是 web-dist：${outDir}`)
}

// 清空再拷，避免上一版按哈希命名的旧资源残留在线上
rmSync(outDir, { recursive: true, force: true })
copyDir(distDir, outDir)

// 校验 2：index.html 里引用的每个本地资源都能在产物里找到
const indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8')
const refs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|#)/.test(u))

const missing = refs.filter((u) => !existsSync(join(outDir, u.replace(/^\.\//, '').split('?')[0])))
if (missing.length > 0) {
  fail(`index.html 引用了产物里不存在的文件：\n  ${missing.join('\n  ')}`)
}

// 校验 3：不得出现 src="/..." 这种绝对引用，否则放到子路径下必然白屏
if (/(?:src|href)="\//.test(indexHtml)) {
  fail('产物里出现了绝对路径引用，检查 app/vite.config.ts 的 base 是否为 "./"')
}

// 汇总
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

const files = walk(outDir)
const bytes = files.reduce((sum, f) => sum + statSync(f).size, 0)
const kb = (bytes / 1024).toFixed(1)

console.log(`\n[完成] 已同步到 ${outDir}`)
console.log(`       ${files.length} 个文件，共 ${kb} KB`)
console.log(`       引用校验通过：${refs.length} 个本地资源全部存在，且均为相对路径`)
console.log('\n下一步：到 WorkBuddy 面板重新发布，线上才会更新。\n')
