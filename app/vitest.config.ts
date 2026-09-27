import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// 复用 vite.config.ts 的解析规则（尤其是 @ -> /src 的别名），只补测试相关配置
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      // 关掉「文件级并行」。原因：某些沙箱环境会拦截 vitest 并行 worker 写模块缓存
      // （EPERM: operation not permitted），导致第二个测试文件被静默跳过——
      // 只跑一个文件却报绿，是最危险的那种假阳性。
      // 用例都是纯函数、毫秒级，串行跑的代价可以忽略。
      fileParallelism: false,
    },
  }),
)
