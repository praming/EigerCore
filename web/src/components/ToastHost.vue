<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { Toast } from '@/stores/dashboard'

/**
 * 轻提示宿主 —— 替代 Flask flash，复用 base.html 的 .toast / .alert 样式与时序。
 *
 * 与 autoDismissToasts() 对齐：
 *  - 3500ms 后开始离场；
 *  - 离场加 .is-leaving 触发 CSS 过渡，500ms 兜底移除；
 *  - 尊重 prefers-reduced-motion：直接移除，不做动画。
 */
const store = useDashboardStore()

/** 正在离场的 toast id 集合（用于加 .is-leaving） */
const leaving = ref<Set<number>>(new Set())
const timers = new Map<number, ReturnType<typeof setTimeout>[]>()

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function schedule(t: Toast) {
  if (timers.has(t.id)) return
  const list: ReturnType<typeof setTimeout>[] = []
  list.push(
    setTimeout(() => {
      if (prefersReducedMotion()) {
        remove(t.id)
        return
      }
      leaving.value = new Set(leaving.value).add(t.id)
      list.push(setTimeout(() => remove(t.id), 500))
    }, 3500)
  )
  timers.set(t.id, list)
}

function remove(id: number) {
  const list = timers.get(id)
  if (list) list.forEach(clearTimeout)
  timers.delete(id)
  const next = new Set(leaving.value)
  next.delete(id)
  leaving.value = next
  store.dismissToast(id)
}

watch(
  () => store.toasts,
  (list) => list.forEach(schedule),
  { deep: true, immediate: true }
)
</script>

<template>
  <div v-if="store.toasts.length" class="toast">
    <div
      v-for="t in store.toasts"
      :key="t.id"
      class="alert shadow-lg"
      :class="[t.type === 'success' ? 'alert-success' : 'alert-error', { 'is-leaving': leaving.has(t.id) }]"
      @click="remove(t.id)"
    >
      <span>{{ t.msg }}</span>
    </div>
  </div>
</template>
