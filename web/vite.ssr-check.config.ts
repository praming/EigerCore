import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 结构回归测试专用配置：把 scripts/ssr-check.ts 打成单文件 Node 包，
// 由 `npm run ssr-check` 编译后直接执行（无需浏览器）。
// emptyOutDir: false —— 产物是单文件、每次覆盖，无需清空目录。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'scripts/ssr-check.ts',
    outDir: '.ssr-out',
    emptyOutDir: false,
    minify: false,
  },
})
