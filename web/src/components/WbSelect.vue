<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

export interface WbSelectOption {
  label: string
  value: string | number
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number
    options: WbSelectOption[]
    disabled?: boolean
    placeholder?: string
  }>(),
  { disabled: false, placeholder: '请选择' }
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string | number): void }>()

// 多根节点时显式关闭自动继承，改由根 div 上的 v-bind="$attrs" 接收 class/style
defineOptions({ inheritAttrs: false })

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const popRef = ref<HTMLElement | null>(null)
const activeIdx = ref(-1)
const upward = ref(false)
const popStyle = ref<Record<string, string>>({})

const hasSelection = computed(() => props.options.some((o) => o.value === props.modelValue))
const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.placeholder
)

// 浮层用 fixed 定位，脱离任何 overflow 容器（如设置页 .wb-pop__body），避免被裁切
function place() {
  const t = triggerRef.value
  if (!t) return
  const r = t.getBoundingClientRect()
  const gap = 6
  const pop = popRef.value
  const ph = pop?.offsetHeight ?? 0
  const vh = window.innerHeight
  const vw = window.innerWidth
  const spaceBelow = vh - r.bottom
  // 下方放不下且上方空间足够时向上翻转
  upward.value = ph > 0 && spaceBelow < ph + gap && r.top > ph + gap
  const top = upward.value ? r.top - ph - gap : r.bottom + gap
  // 浮层宽度与触发钮（下拉框）保持一致：选项文字用 white-space:nowrap + 省略号，绝不换行（见 .select-opt）。
  // 不再按最宽选项撑开面板，避免面板过宽/越界。
  let minW = r.width
  // 不超出视口：宽度上限 + 左/上边界夹取
  const maxW = vw - 16
  if (minW > maxW) minW = maxW
  let left = r.left
  if (left + minW > vw - 8) left = Math.max(8, vw - 8 - minW)
  if (left < 8) left = 8
  let topClamped = top
  if (topClamped < 8) topClamped = 8
  if (topClamped + ph > vh - 8) topClamped = Math.max(8, vh - 8 - ph)
  popStyle.value = {
    position: 'fixed',
    top: `${topClamped}px`,
    left: `${left}px`,
    width: `${minW}px`,
    minWidth: `${minW}px`,
    right: 'auto',
  }
}

function openMenu() {
  if (props.disabled) return
  open.value = true
  activeIdx.value = props.options.findIndex((o) => o.value === props.modelValue)
  // 先渲染再测高，二次 rAF 校准（弹层高度此时已确定）
  nextTick(() => {
    place()
    requestAnimationFrame(place)
  })
}
function toggle() {
  if (props.disabled) return
  if (open.value) {
    open.value = false
    return
  }
  openMenu()
}
function pick(v: string | number) {
  emit('update:modelValue', v)
  open.value = false
}
function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (rootRef.value?.contains(t)) return // 点触发钮本身
  if (popRef.value?.contains(t)) return // 点浮层内部
  open.value = false
}
// 滚动/缩放时关闭浮层（fixed 定位会错位）；浮层自身内部滚动除外
function onScroll(e: Event) {
  if (!open.value) return
  if (popRef.value?.contains(e.target as Node)) return
  open.value = false
}
function onResize() {
  if (open.value) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      openMenu()
    }
    return
  }
  if (e.key === 'Escape') {
    open.value = false
    e.stopPropagation()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(props.options.length - 1, activeIdx.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(0, activeIdx.value - 1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (activeIdx.value >= 0 && activeIdx.value < props.options.length) {
      pick(props.options[activeIdx.value].value)
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true) // 捕获阶段，覆盖内部 overflow 滚动
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div class="select-wrap wb-select" :class="{ open, 'is-disabled': disabled }" v-bind="$attrs" ref="rootRef">
    <button
      type="button"
      class="select-trigger"
      ref="triggerRef"
      :disabled="disabled"
      :class="{ 'is-placeholder': !hasSelection }"
      @click="toggle"
      @keydown="onKey"
    >
      <span class="wb-select__val">{{ selectedLabel }}</span>
      <AppIcon name="chevron-down" class="st-ic" :size="16" />
    </button>
  </div>
  <Teleport to="body">
    <div
      v-if="open"
      ref="popRef"
      class="select-pop select-pop--portal"
      :class="{ open, 'is-up': upward, 'is-active': activeIdx >= 0 }"
      :style="popStyle"
      @click.stop
      @keydown.stop
      @scroll.stop
    >
      <button
        v-for="(o, i) in options"
        :key="o.value"
        type="button"
        class="select-opt"
        :class="{ selected: o.value === modelValue, 'is-active': i === activeIdx }"
        @click="pick(o.value)"
        @mouseenter="activeIdx = i"
      >
        {{ o.label }}
      </button>
    </div>
  </Teleport>
</template>
