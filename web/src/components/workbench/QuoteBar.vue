<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useQuote } from '@/composables/useQuote'
import { useWorkbenchStore } from '@/stores/workbench'
import AppIcon from '../AppIcon.vue'

const wb = useWorkbenchStore()
const { quote, copied, manualRefresh, copyQuote } = useQuote(() => wb.quote.refreshMinutes)

const gearOpen = ref(false)
const gearEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})
function placePop() {
  const g = gearEl.value
  if (!g) return
  const r = g.getBoundingClientRect()
  const w = 240
  let left = r.right - w
  if (left < 8) left = 8
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
  popStyle.value = { top: r.bottom + 6 + 'px', left: left + 'px' }
}
function toggleGear() {
  gearOpen.value = !gearOpen.value
  if (gearOpen.value) nextTick(placePop)
}
const OPTIONS = [
  { label: '关闭', value: 0 },
  { label: '1 分钟', value: 1 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '6 小时', value: 360 },
  { label: '12 小时', value: 720 },
  { label: '24 小时', value: 1440 },
]
const currentMin = computed(() => wb.quote.refreshMinutes)
// 间隔的中文描述（用于齿轮 tooltip：>=60 分钟按小时显示）
const currentLabel = computed(
  () => OPTIONS.find((o) => o.value === currentMin.value)?.label || `${currentMin.value} 分钟`,
)
function setMin(v: number) {
  wb.quote.refreshMinutes = v
  gearOpen.value = false
}

function onDocClick(e: MouseEvent) {
  const el = rootEl.value
  if (el && !el.contains(e.target as Node)) gearOpen.value = false
}
function onScroll() {
  if (gearOpen.value) gearOpen.value = false
}
const rootEl = ref<HTMLElement | null>(null)
watch(gearOpen, (v) => {
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
  <div ref="rootEl" class="wb-quote">
    <button
      class="wb-quote__body"
      type="button"
      :title="copied ? '已复制' : '点击复制名言'"
      @click="copyQuote"
    >
      <span class="wb-quote__mark">“</span>
      <span class="wb-quote__text">{{ quote.text }}</span>
      <span class="wb-quote__mark">”</span>
      <span class="wb-quote__author">— {{ quote.author }}</span>
      <span v-if="copied" class="wb-quote__copied">已复制</span>
    </button>
    <button
      v-if="wb.editMode"
      ref="gearEl"
      class="wb-quote__gear"
      type="button"
      :class="{ 'is-open': gearOpen }"
      :title="currentMin > 0 ? `每 ${currentLabel} 换一句` : '自动换新已关闭'"
      @click.stop="toggleGear"
    >
      <AppIcon name="settings" :size="14" />
    </button>
    <Teleport to="body">
      <div v-if="gearOpen" class="wb-quote__pop" :style="popStyle" @click.stop>
        <div class="wb-quote__pop-title">换新间隔</div>
        <div class="wb-quote__opts">
          <button
            v-for="o in OPTIONS"
            :key="o.value"
            type="button"
            class="wb-quote__opt"
            :class="{ 'is-active': currentMin === o.value }"
            @click="setMin(o.value)"
          >{{ o.label }}</button>
        </div>
      </div>
    </Teleport>
    <button
      class="wb-quote__refresh"
      type="button"
      aria-label="换一句名言"
      title="换一句"
      @click="manualRefresh"
    >
      <AppIcon name="refresh-cw" :size="14" />
    </button>
  </div>
</template>
