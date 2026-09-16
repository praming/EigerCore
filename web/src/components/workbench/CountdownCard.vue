<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import WbCard from '../WbCard.vue'
import { useWorkbenchStore, type CountdownTarget } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const nowTs = ref(Date.now())
let timer: number | undefined

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

interface Remain {
  days: number
  hours: number
  mins: number
  secs: number
  done: boolean
}

function compute(t: CountdownTarget): Remain {
  const now = nowTs.value
  let targetMs = 0
  if (t.kind === 'daily') {
    const [h, m] = t.value.split(':').map(Number)
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    if (d.getTime() <= now) d.setDate(d.getDate() + 1)
    targetMs = d.getTime()
  } else {
    targetMs = new Date(t.value + 'T00:00:00').getTime()
  }
  let diff = Math.floor((targetMs - now) / 1000)
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, done: true }
  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    mins: Math.floor((diff % 3600) / 60),
    secs: diff % 60,
    done: false,
  }
}

const items = computed(() =>
  cfg.value.targets.map((t) => ({ t, r: compute(t) }))
)

function fmt(r: Remain): string {
  const base = `${pad(r.hours)}:${pad(r.mins)}:${pad(r.secs)}`
  return r.days > 0 ? `${r.days}天 ${base}` : base
}

onMounted(() => {
  timer = window.setInterval(() => (nowTs.value = Date.now()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <WbCard :iid="iid" icon="timer">
    <div class="wb-cd__list">
      <div v-for="it in items" :key="it.t.id" class="wb-cd__item">
        <div class="wb-cd__label">
          <span>{{ it.t.label }}</span>
        </div>
        <div v-if="it.r.done" class="wb-cd__time wb-muted">已到达 🎉</div>
        <div v-else class="wb-cd__time">{{ fmt(it.r) }}<small v-if="it.t.kind === 'daily'"> 后</small></div>
      </div>
      <div v-if="items.length === 0" class="wb-cd__empty">点击右上角齿轮添加倒计时目标</div>
    </div>
  </WbCard>
</template>
