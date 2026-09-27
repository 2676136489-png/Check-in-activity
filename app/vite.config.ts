import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：React 插件 + 路径别名
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
})
