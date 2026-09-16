import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 开发期：/api 代理回 Flask（http://127.0.0.1:5000）
// 同域 → 免 CORS、Flask-Login 的 session cookie 与 csrf token 正常传递
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 关闭 Vite 的 outDir 自动清空：本沙箱里 emptyOutDir 会调用系统回收站（safe-delete 分身），
  // 该操作在当前环境会失败导致构建中断。改为手动维护 web/dist（构建前先清掉旧产物）。
  build: {
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      // 登录/注册等仍走 Flask 模板的公开页面，也代理过去
      '/login': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      // Flask 静态资源：lucide.min.js 图标数据 + 用户上传图标（/static/uploads/icons/*）
      // 生产期由 Flask 同域托管，dev 期需代理，否则图标与上传图片 404
      '/static': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
