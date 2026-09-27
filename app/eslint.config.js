import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/*
 * 这个配置里最重要的一条是 `react-hooks/rules-of-hooks`。
 *
 * 它拦的是「条件调用 Hook」这类问题 —— 曾经真实发生过：App 里
 * `if (!repo) return <初始化中/>` 写在了三个 useState 前面，首屏只跑 3 个 Hook、
 * 数据到位后同一轮跑 6 个，React 抛 #310，整个应用白屏。
 * tsc 和 vite build 全程绿灯，SSR 冒烟也测不到（它只渲染一次），
 * 只有这条静态规则能提前拦住。
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
