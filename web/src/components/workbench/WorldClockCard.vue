<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore } from '@/stores/workbench'
import { cityFlagUrl, cityIso, cityLabel, type WorldCity } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
// 城市行间距（px），未设置时回退默认 8px
const lineGap = computed(() => {
  const g = (cfg.value as { lineGap?: number }).lineGap
  return Number.isFinite(g) ? (g as number) : 8
})
const lineGapPx = computed(() => `${lineGap.value}px`)
const now = ref(new Date())
let timer: number | undefined
// 国旗图片加载失败（离线等）时按 ISO 代码降级；key 按时区，避免每秒重算丢失状态
const flagFailed = reactive<Record<string, boolean>>({})

interface CityRow {
  name: string
  label: string
  country: string
  flagUrl: string
  flagTxt: string
  time: string
  date: string
  weekday: string
  isDay: boolean
  offDate: boolean
}

function cityInfo(c: WorldCity): CityRow {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: c.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      hour12: false,
    }).formatToParts(now.value)
  } catch {
    // 时区非法（部分浏览器/ICU 未收录，如 Asia/Surabaya）→ 该城市显示占位，避免整卡崩溃
    return {
      name: c.name,
      label: cityLabel(c),
      country: c.country ?? '',
      flagUrl: cityFlagUrl(c),
      flagTxt: cityIso(c),
      time: '—',
      date: '时区无效',
      weekday: '',
      isDay: true,
      offDate: false,
    }
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = parseInt(get('hour'), 10)
  const isDay = !Number.isNaN(hour) && hour >= 6 && hour < 18
  const month = get('month')
  const day = get('day')
  return {
    name: c.name,
    label: cityLabel(c),
    country: c.country ?? '',
    flagUrl: cityFlagUrl(c),
    flagTxt: cityIso(c),
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    date: `${month}月${day}日`,
    weekday: get('weekday'),
    isDay,
    offDate: `${month}-${day}` !== beijingKey.value,
  }
}

// 以北京（Asia/Shanghai）当地日期为基准，判断各城市是否与北京"同日"
const beijingKey = computed(() => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now.value)
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const d = parts.find((p) => p.type === 'day')?.value ?? ''
  return `${m}-${d}`
})
const rows = computed(() => (cfg.value.cities || []).map(cityInfo))

onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <WbCard :iid="iid" icon="globe">
    <div class="wb-world">
      <ul v-if="rows.length" class="wb-world__list" :style="{ gap: lineGapPx }">
        <li v-for="r in rows" :key="r.name" class="wb-world__row">
          <img
            v-if="!flagFailed[r.name] && r.flagUrl"
            class="wb-world__flag"
            :src="r.flagUrl"
            :alt="r.flagTxt"
            @error="flagFailed[r.name] = true"
          />
          <span v-else-if="r.flagTxt" class="wb-world__flagtxt">{{ r.flagTxt }}</span>
          <span class="wb-world__icon" :class="r.isDay ? 'is-day' : 'is-night'">
            <AppIcon :name="r.isDay ? 'sun' : 'moon'" :size="14" />
          </span>
          <span class="wb-world__city">{{ r.label }}</span>
          <span v-if="r.country" class="wb-world__ctry">{{ r.country }}</span>
          <span class="wb-world__date">{{ r.weekday }} {{ r.date }}</span>
          <span class="wb-world__time" :class="{ 'is-offdate': r.offDate }">{{ r.time }}</span>
        </li>
      </ul>
      <div v-else class="wb-world__empty">请在设置中添加要显示的城市</div>
    </div>
  </WbCard>
</template>
