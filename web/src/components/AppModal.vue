<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 固定定位模态框外壳，复用 input.css 的 .modal / .modal-box 样式。
 *
 * 不再使用原生 <dialog> + showModal()：<dialog> 会渲染在浏览器 top layer，
 * 覆盖所有页面内容（含 WbSelect 经 Teleport 到 body 的下拉浮层 z-index:9999），
 * 导致在模态框内部的下拉框选项无法点击。改为普通 fixed 浮层（z-index:200），
 * 下拉浮层（9999）正常浮于其上、可交互。
 *
 * 行为对齐：
 *  - 由 open 属性驱动渲染（v-if），单一数据源；
 *  - 点击遮罩（.modal 本体而非 .modal-box）关闭；
 *  - ESC 触发关闭（JS 监听，替代 dialog 的 cancel 事件）。
 */
const props = defineProps<{
  open: boolean
  /** 额外的 .modal-box 修饰类，如 max-w-2xl */
  boxClass?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    e.preventDefault()
    emit('close')
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="modal" @click.self="emit('close')">
    <div class="modal-box" :class="boxClass">
      <slot />
    </div>
  </div>
</template>
