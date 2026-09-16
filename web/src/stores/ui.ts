import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 顶层轻提示（替代 Flask flash；复用 .toast/.alert 既有样式） */
export interface Toast {
  id: number
  type: 'success' | 'error'
  msg: string
}

/**
 * UI store —— 全局轻提示。
 * 与认证 / 设置无关，单独抽出，供 auth / settings / dashboard 各 store 共享调用。
 */
export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  let toastSeq = 0

  function pushToast(msg: string, type: Toast['type'] = 'success') {
    const t: Toast = { id: ++toastSeq, type, msg }
    toasts.value.push(t)
    return t.id
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, pushToast, dismissToast }
})
