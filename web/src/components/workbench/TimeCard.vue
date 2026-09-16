<script setup lang="ts">

const props = defineProps<{ iid?: string }>()
import { computed, onMounted, onUnmounted, ref } from 'vue'
import WbCard from '../WbCard.vue'
import { solarToLunar } from '@/utils/lunar'

const now = ref(new Date())
let timer: number | undefined
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}
function time(): string {
  const d = now.value
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function dateStr(): string {
  const d = now.value
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const lunarStr = computed(() => {
  const d = now.value
  const l = solarToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `农历 ${l.monthText}月${l.dayText}`
})

onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <WbCard :iid="iid" icon="clock">
    <div class="wb-time">
      <div class="wb-time__clock">{{ time() }}</div>
      <div class="wb-time__date">{{ weekdays[now.getDay()] }} · {{ dateStr() }}</div>
      <div class="wb-time__lunar">{{ lunarStr }}</div>
    </div>
  </WbCard>
</template>
