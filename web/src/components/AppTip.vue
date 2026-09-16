<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{ text?: string; placement?: 'top' | 'bottom' }>(),
  { placement: 'top' },
)

const visible = ref(false)
const trigger = ref<HTMLElement | null>(null)
const bubble = ref<HTMLElement | null>(null)
let raf = 0

function place() {
  const t = trigger.value
  const b = bubble.value
  if (!t || !b) return
  const r = t.getBoundingClientRect()
  const br = b.getBoundingClientRect()
  const pad = 8
  let left = r.left + r.width / 2 - br.width / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - br.width - pad))
  // 默认显示在上方；若顶部越界则翻到下方
  let top = props.placement === 'bottom' ? r.bottom + pad : r.top - br.height - pad
  if (top < pad) top = r.bottom + pad
  b.style.left = left + 'px'
  b.style.top = top + 'px'
}

function show() {
  if (!props.text) return
  visible.value = true
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(place)
}
function hide() {
  visible.value = false
  cancelAnimationFrame(raf)
}
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span ref="trigger" class="app-tip" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide">
    <slot />
    <Teleport to="body">
      <span v-if="visible && text" ref="bubble" class="app-tip__bubble" role="tooltip">{{ text }}</span>
    </Teleport>
  </span>
</template>
