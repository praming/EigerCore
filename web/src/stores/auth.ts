import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '@/api'
import type { UserDTO } from '@/types/api'

/**
 * Auth store —— 当前登录用户与鉴权态。
 * 仅负责「我是谁 / 是否登录」，不耦合任何业务数据，方便 App.vue / TopBar 等
 * 轻量消费，也便于后续做路由守卫。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDTO | null>(null)
  const authed = ref<boolean>(false)

  async function loadUser() {
    try {
      const u = await authApi.me()
      user.value = u
      authed.value = true
    } catch {
      // 401 / 网络异常：视为未登录，保持 authed=false（SPA 据此跳转 /login）
      user.value = null
      authed.value = false
    }
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      // 不论后端是否成功，本地立即清态（下次 /api/auth/me 会重新判定）
      user.value = null
      authed.value = false
    }
  }

  return { user, authed, loadUser, logout }
})
