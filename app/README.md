# 学习目标管理台 · 工程化版本 (Track B)

React 18 + TypeScript + Vite + Tailwind CSS 实现的学习目标追踪应用。
与单文件 HTML 版本（`../学习目标管理台.html`）功能对齐，但采用工程化架构，
便于简历展示与二次开发。

## ✨ 核心特性

- **ETA 预测**：基于近 7 天回溯均速 + 每周休息日规则，推算目标完成天数
- **状态判定**：正常推进 / 可能延期 / 已逾期 / 已完成 四态自动着色
- **四格复盘**：保持 · 问题 · 尝试 · 下周预案，每周一份
- **离线优先**：默认 IndexedDB 本地存储，零配置可用
- **多云适配**：Repository 模式，可一键切换 Supabase 云端
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
2. **纯函数领域层**：`lib/eta.ts` 的 `buildGoalView` 是纯函数，
   输入目标+打卡，输出含 ETA/状态的视图，可独立单测。
3. **状态集中**：`useStore` 把 Repository 异步操作封装成 React 状态，
   组件只负责渲染。

## 📁 目录结构

```
app/
├── src/
│   ├── types/index.ts        # 领域类型
│   ├── lib/
│   │   ├── date.ts           # 日期工具（纯函数）
│   │   ├── eta.ts            # ETA 与进度计算（核心算法）
│   │   └── palette.ts        # 低饱和配色板
│   ├── repo/
│   │   ├── types.ts          # Repository 接口
│   │   ├── indexeddb.ts      # IndexedDB 适配器
│   │   ├── supabase.ts       # Supabase 适配器
│   │   └── index.ts          # 工厂：按环境选择适配器
│   ├── hooks/useStore.ts     # 全局状态 Hook
│   ├── components/           # UI 组件
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css             # Tailwind + 学术纸感设计令牌
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── postcss.config.js
```

## 🚀 快速开始

```bash
cd app
npm install
npm run dev          # 启动开发服务器 http://localhost:5173
npm run build        # 生产构建，产物在 dist/
npm run preview      # 预览构建产物
npm run typecheck    # 仅类型检查
```

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

**Vercel 一键部署：** 连接仓库，Framework 选 Vite，Build Command `npm run build`，Output `dist`。

## 🧪 核心算法说明

`buildGoalView(goal, logs, today)`：

1. 取最近 7 天（含今天），剔除周日（休息日）
2. 计算有效天内的日均打卡量 `avg7`
3. ETA = `ceil((total - done) / avg7)`（avg7 > 0 时）
4. 状态：
   - `done`：进度 ≥ 100%
   - `overdue`：截止日已过且未完成
   - `at-risk`：ETA > 距截止天数
   - `on-track`：其余

## 📄 License

MIT
