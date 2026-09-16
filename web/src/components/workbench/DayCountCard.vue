<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import WbCard from '../WbCard.vue'
import {
  useWorkbenchStore,
  nextDayCountDate,
  describeDayCount,
  type DayCountEvent,
} from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => (wb.instConfig(props.iid) || {}) as { events?: DayCountEvent[]; lineGap?: number })

// 事件行间距（px），未设置时回退默认 8px
const lineGap = computed(() => {
  const g = (cfg.value as { lineGap?: number }).lineGap
  return Number.isFinite(g) ? (g as number) : 8
})
const halfGap = computed(() => `${Math.max(0, lineGap.value / 2)}px`)

const now = ref(new Date())
let timer: number | undefined

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const items = computed(() => {
  const evs = cfg.value.events || []
  const out = evs.map((e) => {
    const r = nextDayCountDate(e, now.value)
    const dateStr = r.target ? fmt(r.target) : ''
    const rule = e.repeat !== 'once' ? describeDayCount(e) : ''
    return {
      e,
      days: r.days,
      overdue: r.overdue,
      dateStr,
      sub: rule ? `${dateStr} · ${rule}` : dateStr,
    }
  })
  out.sort((a, b) => {
    const oa = a.days < 0
    const ob = b.days < 0
    if (oa !== ob) return oa ? 1 : -1 // 过期沉底
    if (oa && ob) return b.days - a.days // 过期中：较近的在前
    return a.days - b.days // 未来：最近的在前
  })
  return out
})

onMounted(() => {
  // 天数仅在跨日变化，60s 轮询足够轻量且能跨过午夜
  timer = window.setInterval(() => (now.value = new Date()), 60000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <WbCard :iid="iid" icon="calendar-clock">
    <div class="wb-dc__list">
      <template v-for="(it, idx) in items" :key="it.e.id">
        <div class="wb-dc__item" :class="{ 'is-over': it.overdue }">
          <span v-if="it.e.color" class="wb-dc__dot" :style="{ background: it.e.color }"></span>
          <div class="wb-dc__main">
            <span class="wb-dc__label">{{ it.e.label }}</span>
            <span class="wb-dc__sepdot">·</span>
            <span class="wb-dc__desc">{{ it.sub }}</span>
          </div>
          <div class="wb-dc__days">
            <template v-if="it.days === 0">
              <span class="wb-dc__phrase wb-dc__phrase--today">就是今天</span>
            </template>
            <template v-else>
              <span class="wb-dc__phrase">
                <span class="wb-dc__status">{{ it.overdue ? '已过期' : '还有' }}</span>
                <span class="wb-dc__num">{{ Math.abs(it.days) }}</span>
                <span class="wb-dc__unit">天</span>
              </span>
            </template>
          </div>
        </div>
        <div v-if="idx < items.length - 1" class="wb-dc__sep" :style="{ marginTop: halfGap, marginBottom: halfGap }"></div>
      </template>
      <div v-if="items.length === 0" class="wb-dc__empty">点击右上角齿轮添加倒数日</div>
    </div>
  </WbCard>
</template>

<style scoped>
.wb-dc__list {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow: auto;
  padding-right: 2px;
}
.wb-dc__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.15rem 0.1rem;
}
.wb-dc__item.is-over {
  opacity: 0.62;
}
.wb-dc__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.wb-dc__main {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.wb-dc__label {
  font-weight: 600;
  font-size: 0.9rem;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-dc__sepdot {
  flex: 0 0 auto;
  opacity: 0.35;
}
.wb-dc__desc {
  font-size: 0.78rem;
  opacity: 0.6;
  flex: 0 0 auto;
  white-space: nowrap;
}
.wb-dc__days {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
}
.wb-dc__phrase {
  display: inline-flex;
  align-items: baseline;
  gap: 0.18rem;
  color: hsl(var(--bc));
}
.wb-dc__phrase--today {
  font-size: 1rem;
  font-weight: 700;
  color: hsl(var(--a, 38 92% 50%));
}
.wb-dc__status {
  font-size: 0.74rem;
  opacity: 0.6;
}
.wb-dc__num {
  font-size: 1.45rem;
  font-weight: 700;
  color: hsl(var(--a, 38 92% 50%));
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.wb-dc__unit {
  font-size: 0.72rem;
  opacity: 0.7;
}
.wb-dc__sep {
  height: 1px;
  width: 64%;
  margin: 0.28rem auto;
  background: hsl(var(--bc) / 0.12);
  border-radius: 1px;
}
.wb-dc__empty {
  text-align: center;
  opacity: 0.5;
  font-size: 0.8rem;
  padding: 1.2rem 0;
}
</style>
