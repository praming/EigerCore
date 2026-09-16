<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})
function place() {
  const t = triggerEl.value
  if (!t) return
  const r = t.getBoundingClientRect()
  const w = 280
  let left = r.left
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
  popStyle.value = { top: r.bottom + 6 + 'px', left: left + 'px' }
}
function toggle() {
  open.value = !open.value
  if (open.value) place()
}
const today = new Date()
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

// 当前视图显示的年月（与已选值解耦，便于自由翻页）
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth()) // 0-11

// 用 modelValue 初始化视图年月
const parsed = parseDate(props.modelValue)
if (parsed) {
  viewYear.value = parsed.y
  viewMonth.value = parsed.m - 1
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}
function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3] }
}

// 构建 6×7 网格（含前导/后置空白）
const cells = computed<{ day: number | null; key: string }[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const out: { day: number | null; key: string }[] = []
  for (let i = 0; i < startDow; i++) out.push({ day: null, key: `e${i}` })
  for (let d = 1; d <= daysInMonth; d++) out.push({ day: d, key: `d${d}` })
  while (out.length % 7 !== 0) out.push({ day: null, key: `t${out.length}` })
  return out
})

const title = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`)

const triggerLabel = computed(() => {
  const p = parseDate(props.modelValue)
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : '选择出生日期'
})

function cellClass(day: number | null): string[] {
  const cls = ['wb-date__cell']
  if (day === null) cls.push('is-empty')
  if (day !== null) {
    const str = `${viewYear.value}-${pad(viewMonth.value + 1)}-${pad(day)}`
    if (str === todayStr) cls.push('is-today')
    if (str === props.modelValue) cls.push('is-selected')
  }
  return cls
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else viewMonth.value--
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else viewMonth.value++
}
function prevYear() {
  viewYear.value--
}
function nextYear() {
  viewYear.value++
}
function pick(day: number) {
  emit('update:modelValue', `${viewYear.value}-${pad(viewMonth.value + 1)}-${pad(day)}`)
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
  open.value = false
}
function gotoToday() {
  viewYear.value = today.getFullYear()
  viewMonth.value = today.getMonth()
  emit('update:modelValue', todayStr)
  open.value = false
}

// 外部点击关闭
function onDocClick(e: MouseEvent) {
  const el = rootEl.value
  if (el && !el.contains(e.target as Node)) open.value = false
}
function onScroll() {
  if (open.value) open.value = false
}
const rootEl = ref<HTMLElement | null>(null)
watch(open, (v) => {
  if (v) {
    document.addEventListener('click', onDocClick)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  } else {
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <div ref="rootEl" class="wb-date">
    <button
      ref="triggerEl"
      type="button"
      class="wb-date__trigger"
      :class="{ 'is-empty': !modelValue }"
      @click.stop="toggle"
    >
      <AppIcon name="calendar" :size="16" />
      <span>{{ triggerLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="wb-date__pop" :style="popStyle" @click.stop>
      <div class="wb-date__yearnav">
        <button type="button" class="wb-date__nav-btn" @click="prevYear" aria-label="上一年">
          <AppIcon name="chevrons-left" :size="14" />
        </button>
        <span class="wb-date__title" style="flex:1;text-align:center">{{ viewYear }} 年</span>
        <button type="button" class="wb-date__nav-btn" @click="nextYear" aria-label="下一年">
          <AppIcon name="chevrons-right" :size="14" />
        </button>
      </div>
      <div class="wb-date__head">
        <button type="button" class="wb-date__nav-btn" @click="prevMonth" aria-label="上个月">
          <AppIcon name="chevron-left" :size="14" />
        </button>
        <span class="wb-date__title">{{ viewMonth + 1 }} 月</span>
        <button type="button" class="wb-date__nav-btn" @click="nextMonth" aria-label="下个月">
          <AppIcon name="chevron-right" :size="14" />
        </button>
      </div>
      <div class="wb-date__grid">
        <div v-for="w in WEEK" :key="w" class="wb-date__dow">{{ w }}</div>
        <button
          v-for="c in cells"
          :key="c.key"
          type="button"
          :class="cellClass(c.day)"
          :disabled="c.day === null"
          @click="c.day !== null && pick(c.day)"
        >{{ c.day ?? '' }}</button>
      </div>
      <div class="wb-date__foot">
        <button type="button" @click="gotoToday">今天</button>
        <button type="button" @click="clear">清除</button>
      </div>
      </div>
    </Teleport>
  </div>
</template>
