<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import AppModal from '../AppModal.vue'
import WbSelect from '../WbSelect.vue'
import LineChart from './LineChart.vue'
import { workbenchApi, type WeatherInfo, type SunDay, qweatherIconToLucide } from '@/api/workbench'
import { useWorkbenchStore } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()

const w = ref<WeatherInfo | null>(null)
const loading = ref(false)
const lastSync = ref('')
const errorMsg = ref('')

const REFRESH_LABELS: Record<number, string> = {
  10: '10 分钟',
  60: '1 小时',
  360: '6 小时',
  720: '12 小时',
  1440: '24 小时',
}

const cfg = computed(() => wb.instConfig(props.iid) || {})

// 模式徽标（展示当前自动刷新策略），如「间隔 6 小时」「定时 08:00、20:00」「已关闭」
const autoBadge = computed(() => {
  const c = cfg.value
  if (c.refreshMode === 'off') return '已关闭'
  if (c.refreshMode === 'schedule') {
    const times = c.refreshTimes || []
    return times.length ? '定时 ' + times.join('、') : '定时（未设置）'
  }
  return '间隔 ' + (REFRESH_LABELS[c.refreshInterval || 360] || c.refreshInterval + ' 分钟')
})

// —— 前端天气缓存：跨页面刷新存活，使「已同步」只在实际拉取时更新 ——
const CACHE_KEY = 'wb_weather_cache_v1'
function readCache(): any {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeCache(data: WeatherInfo) {
  try {
    const c = cfg.value
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        city: c.city,
        apiKey: c.apiKey || '',
        host: c.host || '',
        ts: Date.now(),
        label: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        data,
      }),
    )
  } catch {
    /* 忽略写入异常（如隐私模式 / 配额） */
  }
}
function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

async function loadWeather(force = false) {
  if (loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await workbenchApi.weather(
      cfg.value.city,
      cfg.value.apiKey || '',
      cfg.value.host || '',
      force,
      cfg.value.auth || 'key',
    )
    w.value = data
    if (data.error) errorMsg.value = '天气获取失败：' + (data.error || '未知错误')
    lastSync.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    writeCache(data)
  } catch (e: any) {
    errorMsg.value = '天气获取失败：' + (e?.message || '网络错误')
  } finally {
    loading.value = false
  }
}

// 手动刷新按钮：强制跳过后端缓存重抓
function refresh() {
  void loadWeather(true)
}

// —— 天气详情弹窗 ——
const showDetail = ref(false)
function openDetail() {
  // 编辑态下不打开详情（避免与拖拽/设置交互冲突）
  if (wb.editMode) return
  showDetail.value = true
}
function closeDetail() {
  showDetail.value = false
}

// —— 太阳弹窗：历史日出日落（年 / 月 / 周）——
const showSun = ref(false)
const sunView = ref<'year' | 'month' | 'week'>('week')
const sunCity = computed(() => cfg.value.city || '郑州')
const sunDays = ref<SunDay[]>([])
const sunLoading = ref(false)
const sunError = ref('')

const nowYear = new Date().getFullYear()
const _today = new Date()
const nowMonth = _today.getMonth() + 1
const todayStr = `${_today.getFullYear()}-${pad2(_today.getMonth() + 1)}-${pad2(_today.getDate())}`
// 年份下拉：当前年往前 10 年
const yearOptions = computed(() => {
  const arr: number[] = []
  for (let y = nowYear; y >= nowYear - 9; y--) arr.push(y)
  return arr
})
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const selYear = ref(nowYear)
const selMonth = ref(nowMonth)

// 某年所有自然周（周一为起点），用于周视图下拉
function weekRanges(year: number) {
  const jan1 = new Date(year, 0, 1)
  const dec31 = new Date(year, 11, 31)
  const dow = (jan1.getDay() + 6) % 7 // 0=周一
  const d = new Date(jan1)
  d.setDate(jan1.getDate() - dow)
  const out: { n: number; start: Date; end: Date }[] = []
  let n = 1
  while (d <= dec31) {
    const start = new Date(d)
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    out.push({ n, start, end })
    d.setDate(d.getDate() + 7)
    n++
  }
  return out
}
// 只保留「起始日不晚于今天」的周，避免下拉出现纯未来的周（无数据）
const weekOptions = computed(() => weekRanges(selYear.value).filter((w) => w.start <= _today))

// 太阳弹窗下拉框选项（原生 select 改为美化 WbSelect）
const yearOpts = computed(() => yearOptions.value.map((y) => ({ value: y, label: `${y} 年` })))
const monthOpts = computed(() => monthOptions.map((m) => ({ value: m, label: `${m} 月` })))
const weekOpts = computed(() =>
  weekOptions.value.map((wk) => ({
    value: wk.n,
    label: `第${wk.n}周 ${wk.start.getMonth() + 1}/${wk.start.getDate()}–${wk.end.getMonth() + 1}/${wk.end.getDate()}`,
  }))
)

// 默认选中「包含今天的周」
function currentWeekIndex(): number {
  const wks = weekRanges(nowYear)
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  for (let i = 0; i < wks.length; i++) {
    if (today >= wks[i].start && today <= wks[i].end) return i + 1
  }
  return 1
}
const selWeek = ref(currentWeekIndex())

// 根据视图 + 选择计算查询区间；未走完的周期（本年/本月/本周）把 end 截断到今天，
// 只请求「已走过」的日期，未来日期暂不显示（与 Open-Meteo 历史档案只覆盖到今天的限制一致）。
const sunRange = computed(() => {
  const y = selYear.value
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
  if (sunView.value === 'year') {
    const end = y === nowYear ? todayStr : `${y}-12-31`
    return { start: `${y}-01-01`, end }
  }
  if (sunView.value === 'month') {
    const m = selMonth.value
    const last = new Date(y, m, 0).getDate()
    const end = y === nowYear && m === nowMonth ? todayStr : `${y}-${pad2(m)}-${pad2(last)}`
    return { start: `${y}-${pad2(m)}-01`, end }
  }
  const wk = weekOptions.value.find((w) => w.n === selWeek.value)
  if (!wk) return { start: '', end: '' }
  const end = wk.end > _today ? todayStr : fmt(wk.end)
  return { start: fmt(wk.start), end }
})

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function toMin(hhmm: string): number | null {
  const p = hhmm.split(':')
  if (p.length < 2) return null
  const h = parseInt(p[0], 10)
  const m = parseInt(p[1], 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}
function fmtMin(min: number | null) {
  if (min == null) return '—'
  min = Math.round(min)
  const h = Math.floor(min / 60)
  const m = ((min % 60) + 60) % 60
  return `${pad2(h)}:${pad2(m)}`
}
function dayLen(sr: string, ss: string): number | null {
  const a = toMin(sr)
  const b = toMin(ss)
  if (a == null || b == null) return null
  let diff = b - a
  if (diff < 0) diff += 24 * 60
  return diff
}
function fmtDayLen(min: number | null, decimals = 0) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  let m = min % 60
  m = decimals > 0 ? Number(m.toFixed(decimals)) : Math.round(m)
  return `${h}小时${m}分`
}

// 年视图：按月聚合（平均日出 / 日落 / 昼长）+ 昼长区间，用于迷你柱图
const sunYear = computed(() => {
  if (sunView.value !== 'year') return null
  const byMonth: Record<number, { sr: number[]; ss: number[]; dl: number[] }> = {}
  for (const d of sunDays.value) {
    const mo = parseInt(d.date.slice(5, 7), 10)
    const a = toMin(d.sunrise)
    const b = toMin(d.sunset)
    if (!byMonth[mo]) byMonth[mo] = { sr: [], ss: [], dl: [] }
    if (a != null) byMonth[mo].sr.push(a)
    if (b != null) byMonth[mo].ss.push(b)
    const dl = dayLen(d.sunrise, d.sunset)
    if (dl != null) byMonth[mo].dl.push(dl)
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const months = Object.keys(byMonth)
    .map(Number)
    .sort((a, b) => a - b)
    .map((mo) => {
      const g = byMonth[mo]
      return { mo, sunrise: fmtMin(avg(g.sr)), sunset: fmtMin(avg(g.ss)), dayLen: fmtDayLen(avg(g.dl), 2), dlMin: avg(g.dl) }
    })
  const vals = months.map((m) => m.dlMin || 0)
  const maxDl = Math.max(1, ...vals)
  const minDl = Math.min(...vals, maxDl)
  return { months, maxDl, minDl }
})

const WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
function weekdayCN(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEK_CN[(new Date(y, m - 1, d).getDay() + 6) % 7]
}
function barPct(v: number | null, min: number, max: number) {
  if (v == null || max <= min) return 60
  return Math.round(((v - min) / (max - min)) * 100)
}
// 月/周视图列表柱状图：以当前视图中最大昼长为基准，按比例绘制（min 8% 保证可见）
const maxListDl = computed(() => {
  let mx = 0
  for (const d of sunDays.value) {
    const dl = dayLen(d.sunrise, d.sunset)
    if (dl != null && dl > mx) mx = dl
  }
  return mx
})
function listBarPct(dl: number | null) {
  if (dl == null) return 0
  const pct = maxListDl.value > 0 ? (dl / maxListDl.value) * 100 : 0
  return Math.max(8, Math.round(pct))
}

function openSun() {
  if (wb.editMode) return
  showSun.value = true
}
function closeSun() {
  showSun.value = false
}
async function loadSun() {
  const { start, end } = sunRange.value
  if (!start || !end) return
  sunLoading.value = true
  sunError.value = ''
  try {
    sunDays.value = await workbenchApi.sunHistory(sunCity.value, start, end)
  } catch (e: any) {
    sunError.value = '日出日落获取失败：' + (e?.message || '网络错误')
    sunDays.value = []
  } finally {
    sunLoading.value = false
  }
}
function setSunView(v: 'year' | 'month' | 'week') {
  if (sunView.value === v) return
  sunView.value = v
  if (showSun.value) void loadSun()
}
function drillMonth(mo: number) {
  selMonth.value = mo
  sunView.value = 'month'
  void loadSun()
}

// 视图 / 选择变化且弹窗打开时重新拉取
watch([showSun, sunView, selYear, selMonth, selWeek], () => {
  if (showSun.value) void loadSun()
})

// 详情弹窗里的折线图数据
const hourlyLabels = computed(() => (w.value?.hourly || []).map((x) => x.time))
const hourlySeries = computed(() => [
  { name: '温度', color: '#f59e0b', values: (w.value?.hourly || []).map((x) => x.temp) },
])
// 7 日温度折线图数据：与「7 天预报」分组同源（dailyGroups），保证和每组天气数据完全一致
const daily7Labels = computed(() => dailyGroups.value.map((x) => x.day))
const daily7Series = computed(() => [
  { name: '最高温', color: '#f97316', values: dailyGroups.value.map((x) => x.high) },
  { name: '最低温', color: '#3b82f6', values: dailyGroups.value.map((x) => x.low) },
])
const hasHourly = computed(() => (w.value?.hourly?.length || 0) > 0)
const hasDaily7 = computed(() => dailyGroups.value.length > 0)

// 详情折线图节点：天气图标 / 风向风力（分行）/ 悬浮图标显示的天气文字
const hourlyIcons = computed(() => (w.value?.hourly || []).map((x) => qweatherIconToLucide(x.icon)))
const hourlyWind = computed(() =>
  (w.value?.hourly || []).map((x) => {
    const dir = (x.windDir || '').replace('风', '')
    const scale = x.windScale || ''
    return dir || scale ? { dir: dir || null, scale: scale || null } : null
  }),
)
// 24h 每个节点的天气文字（悬浮图标显示）
const hourlyTexts = computed(() => (w.value?.hourly || []).map((x) => x.text || null))
const daily7Icons = computed(() => dailyGroups.value.map((x) => x.icon))
// 7d 每个节点的天气文字（悬浮图标显示）
const daily7Texts = computed(() => dailyGroups.value.map((x) => x.cond || null))
const daily7Dates = computed(() => dailyGroups.value.map((x) => x.day))

// 7 天预报分组：优先用 daily7（7 天），回退 forecast（3 天）；每组 = 星期 / 图标+中文天气 / 温度
const dailyGroups = computed(() => {
  const src = (w.value?.daily7 && w.value.daily7.length ? w.value.daily7 : (w.value?.forecast || [])) as any[]
  return src.map((d) => ({
    day: d.day,
    cond: d.cond || '',
    icon: qweatherIconToLucide('icon' in d ? d.icon : undefined),
    high: d.high,
    low: d.low,
  }))
})

// —— 自动刷新定时器 ——
// 间隔模式：按 refreshInterval 分钟定时强制重抓；
// 指定时间模式：每分钟巡检是否到达 refreshTimes 中的某个时间点，到达即强制重抓；
// 关闭模式（off）：不自动刷新，仅手动按钮可用。
let timerId: ReturnType<typeof setInterval> | null = null
let lastFiredMinute = '' // 防止同一分钟重复触发（指定时间模式）
let lastIntervalTs = 0 // 上次间隔刷新时间戳（间隔模式）
let nextLabel = ref('')

function stopAuto() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function startAuto() {
  stopAuto()
  const c = cfg.value
  if (c.refreshMode === 'off') {
    nextLabel.value = ''
    return
  }
  if (c.refreshMode === 'interval') {
    const intervalMs = (c.refreshInterval || 360) * 60 * 1000
    const tickMs = Math.max(1000, Math.min(intervalMs, 60000))
    lastIntervalTs = Date.now()
    timerId = window.setInterval(() => {
      if (Date.now() - lastIntervalTs >= intervalMs) {
        lastIntervalTs = Date.now()
        void loadWeather(true)
      }
    }, tickMs)
    const next = new Date(Date.now() + intervalMs)
    nextLabel.value = '下次 ' + next.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else {
    // schedule 模式：每 20s 巡检一次，命中 HH:MM 即刷新
    timerId = window.setInterval(() => {
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const times = cfg.value.refreshTimes || []
      if (times.includes(hhmm)) {
        // 同一分钟内只刷新一次；保持 lastFiredMinute 不重置，避免重复触发
        if (lastFiredMinute !== hhmm) {
          lastFiredMinute = hhmm
          void loadWeather(true)
        }
      } else if (now.getSeconds() > 30) {
        // 已越过该分钟：重置，允许下个时间点触发
        lastFiredMinute = ''
      }
    }, 20000)
    nextLabel.value = ''
  }
}

// 判断本次挂载是否应直接复用缓存（依据设置页的刷新策略与间隔）
function pickCache(): any {
  const cache = readCache()
  if (!cache || !cache.data) return null
  const c = cfg.value
  if (cache.city !== c.city || cache.apiKey !== (c.apiKey || '') || cache.host !== (c.host || ''))
    return null
  if (c.refreshMode === 'off') return cache
  if (c.refreshMode === 'interval') {
    const intervalMs = (c.refreshInterval || 360) * 60 * 1000
    return Date.now() - cache.ts < intervalMs ? cache : null
  }
  // schedule 模式：6 小时内复用缓存，跨过则重新拉取
  return Date.now() - cache.ts < 6 * 3600 * 1000 ? cache : null
}

onMounted(() => {
  const cache = pickCache()
  if (cache) {
    // 间隔内：展示缓存数据，避免每次刷新页面都显示「已同步 刚刚」
    w.value = cache.data
    lastSync.value = cache.label
    startAuto()
    lastIntervalTs = cache.ts // 让自动刷新定时器从真实拉取时刻起算间隔
  } else {
    void loadWeather(false)
    startAuto()
  }
  // 配置变更（模式 / 间隔 / 时间点 / 城市）→ 清空缓存并即时重拉
  watch(
    () => [
      cfg.value.refreshMode,
      cfg.value.refreshInterval,
      (cfg.value.refreshTimes || []).join(','),
      cfg.value.city,
      cfg.value.apiKey,
      cfg.value.host,
    ],
    () => {
      clearCache()
      startAuto()
      void loadWeather(true)
    },
    { deep: true },
  )
})

onUnmounted(() => {
  stopAuto()
})
</script>

<template>
  <WbCard
    :iid="iid"
    icon="cloud"
    :class="['wb-weather-card', { 'is-clickable': !wb.editMode }]"
    @click="openDetail"
  >
    <template #meta>
      <span v-if="w" class="wb-muted wb-card__meta">{{ w.city }}</span>
      <button
        v-if="!wb.editMode"
        class="wb-weather-card__sun"
        type="button"
        title="历史日出日落"
        @click.stop="openSun"
      >
        <AppIcon name="sun" :size="14" />
      </button>
    </template>
    <template #actions>
      <span v-if="autoBadge" class="wb-wx__auto" :title="nextLabel || ''">{{ autoBadge }}</span>
      <span v-if="lastSync" class="wb-wl__sync">已同步 {{ lastSync }}</span>
      <button
        class="wb-wl__refresh"
        type="button"
        :disabled="loading"
        :title="loading ? '刷新中…' : '刷新天气'"
        @click.stop="refresh"
      >
        <AppIcon name="refresh-cw" :size="13" :class="{ spin: loading }" />
      </button>
    </template>
    <div v-if="errorMsg" class="wb-wx__err">{{ errorMsg }}</div>
    <div v-else-if="w" class="wb-weather">
      <div class="wb-weather__now">
        <div class="wb-weather__temp">{{ w.temp }}°</div>
        <div class="wb-weather__meta">
          <div class="wb-weather__cond">{{ w.condition }}</div>
          <div class="wb-muted">{{ w.low }}° ~ {{ w.high }}°</div>
        </div>
      </div>
      <div class="wb-weather__fc">
        <div v-for="f in w.forecast" :key="f.day" class="wb-weather__day">
          <div class="wb-weather__fday">{{ f.day }}</div>
          <div class="wb-weather__cond2">{{ f.cond }}</div>
          <div class="wb-muted">{{ f.low }}°/{{ f.high }}°</div>
        </div>
      </div>
    </div>
    <div v-else class="wb-muted">加载中…</div>
  </WbCard>

  <!-- 天气详情弹窗：当日详情 + 24h 折线 + 7d 折线 -->
  <AppModal :open="showDetail" box-class="wb-wx-modal" @close="closeDetail">
    <div v-if="w" class="wb-wx-detail">
      <div class="wb-wx-detail__head">
        <div>
          <div class="wb-wx-detail__city">
            <span v-if="w.now?.icon" class="wb-wx-detail__icon"><AppIcon :name="qweatherIconToLucide(w.now.icon)" :size="22" /></span>
            {{ w.city }}
          </div>
          <div class="wb-muted wb-wx-detail__sub">
            {{ w.condition }} · 最高 {{ w.high }}° / 最低 {{ w.low }}°
            <template v-if="w.sunrise || w.sunset"> · 日出 {{ w.sunrise || '—' }} / 日落 {{ w.sunset || '—' }}</template>
          </div>
        </div>
        <button class="wb-wx-detail__close" type="button" title="关闭" @click="closeDetail">
          <AppIcon name="x" :size="18" />
        </button>
      </div>

      <!-- 当日详情 -->
      <section class="wb-wx-detail__sec">
        <h4 class="wb-wx-detail__title">当日详情</h4>
        <div class="wb-wx-now">
          <div class="wb-wx-now__temp">{{ w.temp }}°<small>体感 {{ w.now?.feels ?? w.temp }}°</small></div>
          <div class="wb-wx-now__grid">
            <div class="wb-wx-now__item">
              <span class="wb-muted">湿度</span><b>{{ w.now?.humidity ?? '—' }}%</b>
            </div>
            <div class="wb-wx-now__item">
              <span class="wb-muted">风向</span><b>{{ w.now?.windDir || '—' }}</b>
            </div>
            <div class="wb-wx-now__item">
              <span class="wb-muted">风力</span><b>{{ w.now?.windScale ? w.now.windScale + ' 级' : '—' }}</b>
            </div>
            <div class="wb-wx-now__item">
              <span class="wb-muted">能见度</span><b>{{ w.now?.vis ? w.now.vis + ' km' : '—' }}</b>
            </div>
            <div class="wb-wx-now__item">
              <span class="wb-muted">气压</span><b>{{ w.now?.pressure ? w.now.pressure + ' hPa' : '—' }}</b>
            </div>
          </div>
        </div>
      </section>

      <!-- 24 小时预报折线 -->
      <section class="wb-wx-detail__sec">
        <h4 class="wb-wx-detail__title">24 小时预报</h4>
        <LineChart
          v-if="hasHourly"
          :labels="hourlyLabels"
          :series="hourlySeries"
          :height="190"
          :show-area="true"
          :y-ticks="4"
          :icons="hourlyIcons"
          :node-sub="hourlyWind"
          :node-tips="hourlyTexts"
          :tip-labels="hourlyLabels"
        />
        <p v-else class="wb-muted wb-wx-detail__empty">该天气源未提供 24 小时预报数据</p>
      </section>

      <!-- 7 天预报：每天一组，每组三行（星期 / 图标+中文天气 / 温度），7 组横向排一行 -->
      <section class="wb-wx-detail__sec">
        <h4 class="wb-wx-detail__title">7 天预报</h4>
        <div class="wb-wx-7d">
          <div v-for="(d, i) in dailyGroups" :key="i" class="wb-wx-7d__grp">
            <div class="wb-wx-7d__day">{{ d.day }}</div>
            <div class="wb-wx-7d__cond">
              <AppIcon :name="d.icon" :size="22" />
              <span>{{ d.cond }}</span>
            </div>
            <div class="wb-wx-7d__temp"><b>{{ d.high }}°</b> / {{ d.low }}°</div>
          </div>
        </div>
        <!-- 7 日温度趋势折线图：与上方每组天气数据同源（dailyGroups），最高/最低温两线 -->
        <h4 class="wb-wx-detail__title" style="margin-top: 1.1rem">7 日温度趋势</h4>
        <LineChart
          v-if="hasDaily7"
          :labels="daily7Labels"
          :series="daily7Series"
          :height="200"
          :show-area="true"
          :y-ticks="4"
          :icons="daily7Icons"
          :node-tips="daily7Texts"
          :tip-labels="daily7Dates"
        />
        <p v-else class="wb-muted wb-wx-detail__empty">该天气源未提供 7 天预报数据</p>
      </section>
    </div>
  </AppModal>

  <!-- 太阳弹窗：历史日出日落（年 / 月 / 周） -->
  <AppModal :open="showSun" box-class="wb-sun-modal" @close="closeSun">
    <div class="wb-sun">
      <div class="wb-sun__head">
        <div class="wb-sun__title">
          <AppIcon name="sun" :size="20" />
          <span>日出日落 · {{ sunCity }}</span>
        </div>
        <button class="wb-sun__close" type="button" title="关闭" @click="closeSun">
          <AppIcon name="x" :size="18" />
        </button>
      </div>

      <div class="wb-sun__views">
        <button :class="['wb-sun__view', { on: sunView === 'year' }]" type="button" @click="setSunView('year')">年</button>
        <button :class="['wb-sun__view', { on: sunView === 'month' }]" type="button" @click="setSunView('month')">月</button>
        <button :class="['wb-sun__view', { on: sunView === 'week' }]" type="button" @click="setSunView('week')">周</button>
      </div>

      <div class="wb-sun__pickers">
        <WbSelect
          class="wb-sun__sel"
          :model-value="selYear"
          :options="yearOpts"
          :disabled="sunLoading"
          @update:model-value="(v) => (selYear = v as number)"
        />
        <WbSelect
          v-if="sunView !== 'year'"
          class="wb-sun__sel"
          :model-value="selMonth"
          :options="monthOpts"
          :disabled="sunLoading"
          @update:model-value="(v) => (selMonth = v as number)"
        />
        <WbSelect
          v-if="sunView === 'week'"
          class="wb-sun__sel"
          :model-value="selWeek"
          :options="weekOpts"
          :disabled="sunLoading"
          @update:model-value="(v) => (selWeek = v as number)"
        />
      </div>

      <div v-if="sunError" class="wb-sun__err">{{ sunError }}</div>
      <div v-else-if="sunLoading" class="wb-muted wb-sun__loading">加载中…</div>
      <template v-else>
        <!-- 年视图：按月聚合概览（点月份下钻） -->
        <div v-if="sunView === 'year' && sunYear" class="wb-sun__year">
          <button v-for="m in sunYear.months" :key="m.mo" class="wb-sun__mo" type="button" @click="drillMonth(m.mo)">
            <div class="wb-sun__mo-top">
              <span class="wb-sun__mo-name">{{ m.mo }} 月</span>
              <span class="wb-sun__mo-dl">{{ m.dayLen }}</span>
            </div>
            <div class="wb-sun__mo-bar"><span :style="{ width: barPct(m.dlMin, sunYear.minDl, sunYear.maxDl) + '%' }"></span></div>
            <div class="wb-sun__mo-sub">日出 {{ m.sunrise }} · 日落 {{ m.sunset }}</div>
          </button>
        </div>
        <!-- 月 / 周视图：逐日列表 -->
        <div v-else class="wb-sun__list">
          <div class="wb-sun__row wb-sun__row--head">
            <span>日期</span><span>日出</span><span>日落</span><span>昼长</span><span>趋势</span>
          </div>
          <div v-for="d in sunDays" :key="d.date" class="wb-sun__row">
            <span>{{ d.date.slice(5) }} {{ weekdayCN(d.date) }}</span>
            <span>{{ d.sunrise || '—' }}</span>
            <span>{{ d.sunset || '—' }}</span>
            <span>{{ fmtDayLen(dayLen(d.sunrise, d.sunset)) }}</span>
            <span class="wb-sun__bar"><i :style="{ width: listBarPct(dayLen(d.sunrise, d.sunset)) + '%' }"></i></span>
          </div>
          <div v-if="!sunDays.length" class="wb-muted wb-sun__empty">该区间暂无数据</div>
        </div>
      </template>
    </div>
  </AppModal>
</template>

<style scoped>
/* 卡片可点击打开详情：悬浮提示 + 指针光标（编辑态无此态） */
.wb-weather-card.is-clickable {
  cursor: pointer;
}
.wb-weather-card__hint {
  margin-left: 6px;
  font-size: 11px;
  opacity: 0.55;
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 7px;
  line-height: 16px;
  transition: opacity 0.2s ease;
}
.wb-weather-card.is-clickable:hover .wb-weather-card__hint {
  opacity: 0.9;
}

/* 详情弹窗 */
.wb-wx-detail {
  color: var(--text-base, #1f2937);
}
.wb-wx-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.wb-wx-detail__city {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-wx-detail__icon {
  display: inline-flex;
  opacity: 0.85;
}
.wb-wx-detail__sub {
  font-size: 13px;
  margin-top: 2px;
}
.wb-wx-detail__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  /* dialog.showModal() 会把焦点落入首个可聚焦元素（即此关闭按钮），浏览器默认会画出焦点轮廓（看起来像边框）。
     显式去掉 outline，改用 :focus-visible 的柔和背景变化作为可访问性反馈，避免「刷新后第一次打开出现边框」的现象。 */
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: opacity 0.2s ease, background 0.2s ease;
}
.wb-wx-detail__close:hover,
.wb-wx-detail__close:focus-visible {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
}
/* 卡片上的刷新按钮同样去掉默认焦点轮廓，保持一致观感 */
.wb-wl__refresh {
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.wb-wx-detail__sec {
  margin-top: 18px;
}
.wb-wx-detail__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px;
  opacity: 0.85;
}
.wb-wx-detail__empty {
  font-size: 13px;
  opacity: 0.5;
  padding: 8px 0;
}

/* 当日详情 */
.wb-wx-now {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.wb-wx-now__temp {
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  flex-direction: column;
}
.wb-wx-now__temp small {
  font-size: 13px;
  font-weight: 400;
  opacity: 0.6;
  margin-top: 4px;
}
.wb-wx-now__grid {
  flex: 1;
  min-width: 200px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 10px 14px;
}
.wb-wx-now__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}
.wb-wx-now__item b {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 7 天降级列表（无折线数据时） */
/* 7 天预报：每天一组，每组三行（星期 / 图标+中文天气 / 温度），7 组横向排一行 */
.wb-wx-7d {
  display: flex;
  gap: .5rem;
  overflow-x: auto;
  padding-bottom: .3rem;
}
.wb-wx-7d__grp {
  flex: 1 1 0;
  min-width: 4.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .4rem;
  padding: .55rem .3rem;
  border-radius: .7rem;
  background: rgba(128, 128, 128, 0.06);
}
.wb-wx-7d__day {
  font-size: .82rem;
  font-weight: 600;
}
.wb-wx-7d__cond {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .2rem;
  font-size: .72rem;
  opacity: 0.8;
  text-align: center;
  line-height: 1.2;
}
.wb-wx-7d__temp {
  font-size: .78rem;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--bc) / .75);
}
.wb-wx-7d__temp b {
  font-weight: 600;
  color: hsl(var(--bc) / .95);
}

/* 卡片上的太阳按钮：替换原「详情」提示，点击打开历史日出日落弹窗 */
.wb-weather-card__sun {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #f59e0b;
  border-radius: 999px;
  cursor: pointer;
  opacity: 0.7;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.wb-weather-card.is-clickable:hover .wb-weather-card__sun {
  opacity: 1;
  background: rgba(245, 158, 11, 0.12);
  transform: rotate(18deg);
}

/* 太阳弹窗 */
.wb-sun {
  color: var(--text-base, #1f2937);
}
.wb-sun__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.wb-sun__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #b45309;
}
.wb-sun__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: opacity 0.2s ease, background 0.2s ease;
}
.wb-sun__close:hover,
.wb-sun__close:focus-visible {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
}
/* 视图分段切换 */
.wb-sun__views {
  display: flex;
  gap: 6px;
  background: rgba(128, 128, 128, 0.08);
  padding: 4px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.wb-sun__view {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 7px 0;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: background 0.2s ease, color 0.2s ease;
}
.wb-sun__view.on {
  background: var(--color-background-primary, #fff);
  color: var(--text-base, #1f2937);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
/* 下拉选择区 */
.wb-sun__pickers {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.wb-sun__sel {
  flex: 1;
  min-width: 0;
}
.wb-sun__sel .select-trigger {
  width: 100%;
  font-size: 13px;
}
.wb-sun__sel.is-disabled .select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
}
/* 错误 / 加载 */
.wb-sun__err {
  font-size: 13px;
  color: #b91c1c;
  padding: 10px 0;
}
.wb-sun__loading,
.wb-sun__empty {
  font-size: 13px;
  opacity: 0.5;
  padding: 10px 0;
}
/* 逐日列表（月 / 周） */
.wb-sun__list {
  display: flex;
  flex-direction: column;
}
.wb-sun__row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr 1.2fr;
  gap: 10px;
  padding: 7px 6px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  align-items: center;
  border-bottom: 0.5px solid rgba(128, 128, 128, 0.12);
}
.wb-sun__row--head {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  border-bottom: 0.5px solid rgba(128, 128, 128, 0.25);
}
/* 五列标题与数据均居中、列宽平均 */
.wb-sun__row--head span {
  text-align: center;
}
.wb-sun__row span {
  text-align: center;
}
/* 列表末列：昼长柱状图（扁平纯色，按当前视图最大昼长比例绘制） */
.wb-sun__bar {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 13px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.14);
  overflow: hidden;
}
.wb-sun__bar i {
  display: block;
  height: 100%;
  min-width: 6%;
  border-radius: 999px;
  background: #f59e0b;
}
/* 年视图：按月聚合卡片 */
.wb-sun__year {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.wb-sun__mo {
  text-align: left;
  min-width: 0;
  border: 0.5px solid var(--color-border-tertiary, rgba(0, 0, 0, 0.12));
  border-radius: 10px;
  padding: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.wb-sun__mo:hover {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}
.wb-sun__mo-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.wb-sun__mo-name {
  font-size: 14px;
  font-weight: 600;
}
.wb-sun__mo-dl {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #b45309;
}
.wb-sun__mo-bar {
  height: 5px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.14);
  margin: 7px 0 6px;
  overflow: hidden;
}
.wb-sun__mo-bar span {
  display: block;
  height: 100%;
  min-width: 8%;
  border-radius: 999px;
  background: #f59e0b;
}
.wb-sun__mo-sub {
  font-size: 11px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}
</style>
