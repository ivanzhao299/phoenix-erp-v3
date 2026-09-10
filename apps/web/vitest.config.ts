import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest 配置 — apps/web 前端单元测试。
 *
 * 设计原则（与 CLAUDE.md "验证必须真做" 一致）：
 *  - 默认纯逻辑；组件行为测试通过文件级 jsdom 环境运行真实 DOM/effect。
 *  - environment 用 node：被测模块均为纯函数，无需 jsdom，速度更快。
 *  - alias '@/' 对齐 tsconfig.json paths，使 import '@/lib/...' 在测试中可解析。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
