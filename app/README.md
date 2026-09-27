# 学习目标管理台 · 工程化版

React 18 + TypeScript + Vite + Tailwind CSS 实现的学习目标追踪应用。
与单文件 HTML 版本（`../学习目标管理台.html`）功能对齐，但采用工程化架构，
便于二次开发与测试。

[![CI](https://github.com/2676136489-png/Check-in-activity/actions/workflows/ci.yml/badge.svg)](https://github.com/2676136489-png/Check-in-activity/actions/workflows/ci.yml)
![tests](https://img.shields.io/badge/tests-51%20passed-2c6b5c.svg)

## ✨ 核心特性

- **ETA 预测**：基于近 7 天回溯均速 + 每周休息日规则，推算目标完成天数
- **状态判定**：正常推进 / 可能延期 / 已逾期 / 已完成 四态自动着色
- **四格复盘**：保持 · 问题 · 尝试 · 下周预案，每周一份
- **离线优先**：默认 IndexedDB 本地存储，零配置可用
- **多云适配**：Repository 模式，可一键切换 Supabase 云端
- **空态引导**：首次打开是一张白纸，提供「载入示例数据 / 新建目标」两条明确出路
- **示例数据**：四组带 14 天打卡记录的目标，同时覆盖四种状态，随时可清除
- **JSON 备份**：一键导出 / 导入全量数据

## 🏗 架构

```
┌─────────────────────────────────────────────┐
│                  UI (React)                 │
│  components/  pages/  hooks/useStore.ts     │
└──────────────────┬──────────────────────────┘
                   │  领域类型 + 纯函数
┌──────────────────▼──────────────────────────┐
│            Domain (无副作用)                 │
│  types/  lib/date.ts  lib/eta.ts            │
│          lib/chart.ts  lib/sample.ts        │
└──────────────────┬──────────────────────────┘
                   │  Repository 接口
┌──────────────────▼──────────────────────────┐
│           Data (可替换适配器)                 │
│  repo/types.ts  ┌─────────┐ ┌──────────┐   │
│                 │IndexedDB│ │ Supabase │   │
│                 └─────────┘ └──────────┘   │
└─────────────────────────────────────────────┘
```

**关键设计决策：**

1. **依赖倒置**：业务层只依赖 `Repository` 接口，不依赖具体存储。
   换适配器（IndexedDB → Supabase）只需改 `createRepo()` 工厂。
2. **纯函数领域层**：`lib/` 里的函数不碰 DOM、不碰存储、不读系统时间，
   因此可以被确定性测试。
3. **状态集中**：`useStore` 把 Repository 异步操作封装成 React 状态，
   组件只负责渲染。

## ✅ 测试

```bash
npm test          # 一次性运行：4 个文件 / 51 个用例
npm run test:watch
```

| 文件 | 用例 | 覆盖重点 |
|---|---|---|
| `src/lib/eta.test.ts` | 14 | 休息日不计日均但计入累计；`avg7 = 0` 时 `etaDays` 返回 `null`（不编造 0）；四态判定优先级（`overdue` 盖过 `at-risk`，已逾期但已完成仍为 `done`）；`dueLabel` 的已完成分支；进度封顶 1、`rest` 不为负；`dailySeries` 同天求和与零补齐；周去重按周一判定 |
| `src/lib/sample.test.ts` | 16 | 示例数据对同一个 `today` 输出恒定；所有日期落在 14 天窗口内；每条打卡的 `goalId` 都能找到目标；**四种状态恰好各覆盖一次**；换 `today` 时日期整体平移、条数不变 |
| `src/lib/chart.test.ts` | 11 | 堆叠 offset 连续；总量等于各段之和；某目标当天没数据时后续段 offset 不被凭空抬高；同一目标同一天多条记录先求和；没填用时的记录不参与也不按 0 计入；窗口外记录被丢弃 |
| `src/lib/date.test.ts` | 10 | `isoDate` 补零；`daysBetween` 可正可负、跨月跨年；`offsetDays` 闰年（`2028-02-28 → 02-29 → 03-01`）；`mondayOf` 周日归本周一；`recentDays` 含基准当天、从旧到新、跨月连续 |

> **为什么关闭了文件级并行**：Vitest 默认并行跑测试文件。在某些沙箱环境里，worker 写模块缓存会被系统拦截（`EPERM: operation not permitted`），结果是**第二个测试文件被静默跳过、run 却依然报绿**——只跑了一个文件还说通过，是最危险的假阳性。`vitest.config.ts` 里设了 `test.fileParallelism: false`，并把原因写在注释里。51 个用例总耗时不到 4 秒，串行的代价可以忽略。

## 🔍 Lint

```bash
npm run lint
```

ESLint 9 flat config + typescript-eslint。其中 `react-hooks/rules-of-hooks` 拦下过一个真实事故：`App.tsx` 里 `if (!repo) return` 写在三个 `useState` 之前，首屏只跑 3 个 Hook、数据到位后同一轮跑 6 个，React 抛 #310，**整个应用白屏**——而 `tsc` 与 `vite build` 全程绿灯。

## 🧪 渲染冒烟

```bash
npm run smoke
```

`tsc` 和 `vite build` 都不跑渲染，构建通过不代表页面能渲染。这个脚本用 `react-dom/server` 把组件真正渲染成 HTML 再断言内容（Vite 项目的 `.tsx` 不能被 node 直接 import，所以走 `vite.ssrLoadModule`）。

覆盖 25 项断言：App 整体不抛错、四个页签各自的标题与数据、四态标签齐全、**图表柱子是否真的按目标分色**（而不只是图例分色）、空态的两条出路、页头统计口径。

**已知边界**：SSR 不执行 `useEffect`，所以只能验证首屏渲染与内容，**点击、切换、IndexedDB 落盘测不到**，这部分直接在浏览器里跑 `npm run preview` 确认。

## 📸 文档配图

README 里的截图是实拍的，不是设计稿，而且重新生成很简单：

```bash
npm run build
npm run preview        # 另开一个终端
npm run shots          # 输出到 ../docs/
```

脚本在真实浏览器里打开构建产物、点「载入示例数据」、逐页签截图，顺带断言「已完成的目标不会显示逾期文案」。截图脚本入库的意义就在这——图如果不是可复现的，它和设计稿没区别。

## 🔄 CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 的 `app` job，每次 push 到 `main` 与每个 PR 都会跑：

```
npm ci  →  npm run lint  →  npm run typecheck  →  npm test  →  npm run smoke  →  npm run build
```

另有三个 job 负责单文件版的产物复现断言、单文件版页面交互冒烟，以及敏感信息扫描（见根 README）。

## 📁 目录结构

```
app/
├── src/
│   ├── types/index.ts        # 领域类型
│   ├── lib/
│   │   ├── date.ts           # 日期工具（纯函数）
│   │   ├── date.test.ts      #   └ 10 个用例
│   │   ├── eta.ts            # ETA / 进度 / 状态 / dueLabel（核心算法）
│   │   ├── eta.test.ts       #   └ 14 个用例
│   │   ├── chart.ts          # 图表堆叠数学（纯函数）
│   │   ├── chart.test.ts     #   └ 11 个用例
│   │   ├── sample.ts         # 示例数据生成（纯函数，日期相对 today）
│   │   ├── sample.test.ts    #   └ 16 个用例
│   │   └── palette.ts        # 低饱和配色板
│   ├── repo/
│   │   ├── types.ts          # Repository 接口
│   │   ├── indexeddb.ts      # IndexedDB 适配器
│   │   ├── supabase.ts       # Supabase 适配器
│   │   └── index.ts          # 工厂：按环境选择适配器
│   ├── hooks/useStore.ts     # 全局状态 Hook
│   ├── components/           # UI 组件（含 EmptyState 空态引导）
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css             # Tailwind + 学术纸感设计令牌
├── scripts/
│   ├── smoke-render.mjs      # SSR 渲染冒烟（25 项断言）
│   └── shots.mjs             # 生成 ../docs/ 里的 README 实拍图
├── public/favicon.svg        # 与设计系统同源的进度环图标
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts          # 复用 vite 配置 + fileParallelism: false
├── eslint.config.js
├── tailwind.config.ts
└── postcss.config.js
```

## 🚀 快速开始

```bash
cd app
npm install
npm run dev          # 启动开发服务器 http://localhost:5173
npm run lint         # ESLint
npm test             # 运行单元测试（4 文件 / 51 用例）
npm run smoke        # SSR 渲染冒烟（25 项）
npm run typecheck    # 仅类型检查
npm run build        # 生产构建，产物在 dist/
npm run preview      # 预览构建产物
```

首次打开是空态——数据默认存在浏览器本地，所以是一张白纸，这不是加载失败。
在空态页点「载入示例数据」即可看到四组带 14 天记录的目标，覆盖四种状态；
在「我的」页可以重置示例数据或清除全部数据。

## ☁️ 启用 Supabase 云端存储

1. 安装依赖：
   ```bash
   npm install @supabase/supabase-js
   ```
2. 创建 `.env.local`：
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. 在 Supabase 建三张表（`goals` / `logs` / `reviews`），字段名与 `src/types/index.ts` 对齐。
4. 重启 `npm run dev`，`createRepo()` 会自动检测环境变量并切换到 Supabase 适配器。

## 📦 部署

构建产物为纯静态文件，可部署到任意静态托管：

```bash
npm run build
# 将 dist/ 上传到 Vercel / Netlify / Cloudflare Pages / GitHub Pages
```

`vite.config.ts` 里设了 `base: './'`，产物引用是相对路径，因此部署到**子路径**下（如 GitHub Pages 的 `/Check-in-activity/`）也不会 404 白屏。

**Vercel 一键部署：** 连接仓库，Framework 选 Vite，Build Command `npm run build`，Output `dist`。

## 🧮 核心算法说明

`buildGoalView(goal, logs, today)`：

1. 取最近 7 天（含今天），剔除周日（休息日）
2. 计算有效天内的日均打卡量 `avg7`
3. ETA = `ceil((total - done) / avg7)`（avg7 > 0 时，否则 `null`）
4. 状态：
   - `done`：进度 ≥ 100%
   - `overdue`：截止日已过且未完成
   - `at-risk`：ETA > 距截止天数
   - `on-track`：其余

`stackByGoal(goals, logs, today, days=14)`：把记录摊成堆叠柱的分段数据，
只统计填了用时的记录；返回 `{ date, total, segments: [{ goalId, goalName, color, value, offset }] }`，
柱子与图例共用同一份结果，避免两边对不上。

## 📄 License

MIT
