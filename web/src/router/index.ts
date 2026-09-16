import { createRouter, createWebHistory } from 'vue-router'
import App from '@/App.vue'

// 单页应用：所有视图经 store 在前端切换，故仅注册一条 '/' 路由；
// 未登录访问 / 时由前端跳转至后端 /login（Jinja 页面）完成鉴权。
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: App },
  ],
})

export default router
