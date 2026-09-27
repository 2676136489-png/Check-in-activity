import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：React 插件 + 路径别名 + 可部署到任意子路径
export default defineConfig({
  plugins: [react()],

  // 关键：用相对路径引用产物。
  // 默认（base: '/'）会生成 src="/assets/xxx.js" 这种绝对引用，
  // 一旦部署在子路径下（例如 GitHub Pages 的 /Check-in-activity/），
  // 资源全部 404，页面直接白屏。改成 './' 后放在任何目录都能跑。
  base: './',

  resolve: {
    alias: {
      '@': '/src',
    },
  },

  build: {
    target: 'es2020',
    sourcemap: true,
  },

  // 线上预览会被套在反向代理域名下，Vite 默认会以
  // "Blocked request. This host is not allowed." 拒绝这类 Host 请求。
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
