import type { Config } from 'tailwindcss'

/**
 * Tailwind 设计令牌 —— 对齐「学术纸感」视觉系统
 * 纸底 #f6f2e9 / 墨绿主色 #1d5346 / 衬线标题 / hairline 边框
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f6f2e9',
        ink: {
          DEFAULT: '#1d5346',
          50: '#eef3f1',
          100: '#d6e2de',
          500: '#1d5346',
          600: '#174339',
          700: '#11332b',
        },
        hairline: 'rgba(29, 83, 70, 0.16)',
        muted: '#6b6557',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', 'Georgia', 'serif'],
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        paper: '0 1px 0 rgba(29,83,70,0.06)',
        card: '0 1px 2px rgba(29,83,70,0.06), 0 0 0 1px rgba(29,83,70,0.08)',
      },
      borderRadius: {
        '2xl': '14px',
      },
    },
  },
  plugins: [],
} satisfies Config
