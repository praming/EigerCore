<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { workbenchApi, type BiddingHit, type BiddingSourceStatus } from '@/api/workbench'
import { useWorkbenchStore } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const hits = ref<BiddingHit[]>([])
const loading = ref(true)
const refreshing = ref(false)
const inFlight = ref(false) // 并发守卫：仅在请求真正进行中时阻止重复拉取
const lastUpdated = ref<Date | null>(null) // 最近一次成功抓取的时间，用于顶部「更新 时间」
// 各抓取源最近一次抓取状态：失败源会高亮提示，帮助定位「刷新抓不到新数据」的根因
const srcStatus = ref<BiddingSourceStatus[]>([])

// 最新命中：按时间范围 tab 过滤
type TabKey = 'all' | 'today' | '3d' | '7d' | '30d' | '3m' | '6m'
const tab = ref<TabKey>('all')
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '当天' },
  { key: '3d', label: '近三天' },
  { key: '7d', label: '近一周' },
  { key: '30d', label: '近一月' },
  { key: '3m', label: '近三月' },
  { key: '6m', label: '近半年' },
]

/** 时间范围起点（含当天，闭区间） */
function periodStart(key: TabKey): Date {
  if (key === 'all') return new Date(2000, 0, 1) // 「全部」：远古起点，不做时间过滤
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // 今天 00:00
  const offset =
    key === 'today' ? 0 :
    key === '3d' ? 2 :
    key === '7d' ? 6 :
    key === '30d' ? 29 :
    key === '3m' ? 90 :
    key === '6m' ? 180 : 0
  return new Date(d.getTime() - offset * 86400000)
}

// 数据源 tab：区分不同自定义源（全部 + 每个配置源）
// 值为源 id；'all' 表示不过滤
const sourceTab = ref<number | 'all'>('all')

/** 从 URL 提取 host（去 www. 前缀），用于按站点归属命中到配置源 */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./i, '')
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  }
}

/** 命中归属到哪个配置源（按自定义名或 sourceUrl host 匹配），返回源 id 或 null（未匹配则只出现在「全部」） */
function sourceIdOf(h: BiddingHit): number | null {
  const sources = cfg.value.sources
  for (const s of sources) {
    if (s.name && (h.source === s.name || h.sourceName === s.name)) return s.id
  }
  for (const s of sources) {
    if (s.url && h.sourceUrl && hostOf(h.sourceUrl) === hostOf(s.url)) return s.id
  }
  return null
}

// 先按时间范围过滤（命中大多无日期 → 无日期项默认展示）
const timeFiltered = computed(() =>
  hits.value.filter((h) => {
    if (!h.publishedAt) return true
    const t = new Date(h.publishedAt.replace(' ', 'T'))
    if (Number.isNaN(t.getTime())) return true
    return t >= periodStart(tab.value)
  }),
)

// 数据源 tab 列表：全部 + 各配置源（含当前时间范围内的命中计数徽标）
const sourceTabs = computed<{ key: number | 'all'; label: string; count: number }[]>(() => {
  const tabs: { key: number | 'all'; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: timeFiltered.value.length },
  ]
  for (const s of cfg.value.sources) {
    const cnt = timeFiltered.value.filter((h) => sourceIdOf(h) === s.id).length
    tabs.push({ key: s.id, label: s.name || hostOf(s.url), count: cnt })
  }
  return tabs
})

// 最终展示：时间范围 × 数据源 两个维度交叉过滤
const filteredHits = computed(() => {
  const st = sourceTab.value
  if (st === 'all') return timeFiltered.value
  return timeFiltered.value.filter((h) => sourceIdOf(h) === st)
})

// 配置源被删除后，选中的源 tab 可能已不存在 → 回退到「全部」
watch(
  () => cfg.value.sources.map((s) => s.id),
  (ids) => {
    if (sourceTab.value !== 'all' && !ids.includes(sourceTab.value as number)) {
      sourceTab.value = 'all'
    }
  },
)

// 空状态文案：区分「完全没抓到」「该数据源无命中」「该时间段无命中」
const emptyHint = computed(() => {
  if (hits.value.length === 0) return '暂未抓到匹配内容，请检查抓取源 URL 与关键词'
  if (filteredHits.value.length > 0) return ''
  if (sourceTab.value !== 'all') {
    const s = cfg.value.sources.find((x) => x.id === sourceTab.value)
    return `「${s ? (s.name || hostOf(s.url)) : '该数据源'}」暂未抓到命中，请检查 URL/关键词或点刷新`
  }
  if (tab.value !== 'all') return `该时间段内暂无命中，可切「全部」查看 ${hits.value.length} 条历史命中`
  return '暂未抓到匹配内容，请检查抓取源 URL 与关键词'
})

// 是否尚未配置任何抓取源（公开版默认空，需用户自行添加）
const noSources = computed(() => (cfg.value.sources || []).length === 0)

// 抓取失败的源（本次刷新触发才可能有）：用于顶部横幅提示「为何没抓到新数据」
const failedStatuses = computed(() => srcStatus.value.filter((s) => !s.ok))

// 拉取招标命中；force=true 时跳过后端缓存强制重抓
// 始终携带用户配置的抓取源，使设置页的增删改即时反映到抓取结果
async function refresh(force = false) {
  // 仅当已有请求在途且非强制时才跳过，避免重复拉取；
  // 注意不能用 loading 做守卫——否则首次挂载时 loading=true 会让自动拉取提前返回，卡片空白。
  if (inFlight.value && !force) return
  inFlight.value = true
  refreshing.value = true
  loading.value = true
  try {
    const res = await workbenchApi.biddingHits(cfg.value.sources, force)
    hits.value = res.items
    // 抓取触发（force 或首次）时后端回传各源状态；读库命中则 statuses 为空，无需提示
    srcStatus.value = res.statuses || []
    // 展示「真实抓取数据时间」：取后端返回的最近入库时刻，而非前端请求/页面刷新时刻
    lastUpdated.value = res.fetchedAt
      ? new Date(res.fetchedAt.replace(' ', 'T'))
      : null
  } catch {
    /* 忽略抓取失败，保留上次结果 */
  } finally {
    inFlight.value = false
    refreshing.value = false
    loading.value = false
  }
}

onMounted(() => {
  refresh(false)
})

// 抓取源配置变更（增删改）后重新拉取（强制回源），确保改动即时生效
watch(
  () => cfg.value.sources,
  () => {
    if (!loading.value) refresh(true)
  },
  { deep: true },
)

// 自动抓取：autoFetch 开启时按 fetchInterval（分钟）定时强制回源（refresh=1），推进「更新时间」
const autoFetch = computed(() => cfg.value.autoFetch)
const fetchInterval = computed(() => cfg.value.fetchInterval)
let timer: number | null = null
function startTimer() {
  stopTimer()
  if (!autoFetch.value || fetchInterval.value <= 0) return
  timer = window.setInterval(() => refresh(true), fetchInterval.value * 60000)
}
function stopTimer() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}
watch([autoFetch, fetchInterval], startTimer)
onMounted(startTimer)
onBeforeUnmount(stopTimer)

interface Seg {
  t: string
  hit: boolean
}
function segments(text: string, kws: string[]): Seg[] {
  if (!kws.length) return [{ t: text, hit: false }]
  const esc = kws.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${esc.join('|')})`, 'g')
  const out: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), hit: false })
    out.push({ t: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false })
  return out
}

// 正文截断展示
function truncate(s: string, n = 140): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// 最后刷新时间格式化：YYYY-MM-DD HH:mm
function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}
function formatDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 命中文摘：取正文/标题中首个关键词前后的上下文片段，替换原「查看原文」行。
// 返回分段（关键词命中段 hit=true），模板用链接字号上色、关键词标红渲染。
function contextSegments(h: BiddingHit): Seg[] {
  const kws = h.keywords || []
  if (!kws.length) return []
  const norm = (s?: string) => (s || '').replace(/\s+/g, ' ').trim()
  // 优先级：正文 > 摘要 > 标题，命中即取首个关键词的上下文窗口
  const sources = [norm(h.body), norm(h.summary), norm(h.title)].filter(Boolean)
  const esc = kws.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${esc.join('|')})`)
  const span = 42 // 关键词前后各取约 42 字
  for (const text of sources) {
    const m = re.exec(text)
    if (!m) continue
    const idx = m.index
    const kw = m[0]
    const start = Math.max(0, idx - span)
    const end = Math.min(text.length, idx + kw.length + span)
    const before = text.slice(start, idx)
    const after = text.slice(idx + kw.length, end)
    const out: Seg[] = []
    if (before) out.push({ t: (start > 0 ? '…' : '') + before, hit: false })
    out.push({ t: kw, hit: true })
    if (after) out.push({ t: after + (end < text.length ? '…' : ''), hit: false })
    return out
  }
  return []
}
</script>

<template>
  <WbCard :iid="iid" icon="gavel">
    <template #meta>
      <span v-if="lastUpdated" class="wb-muted wb-card__meta">更新 {{ formatDateTime(lastUpdated) }}</span>
      <span class="wb-muted wb-card__meta">源 {{ cfg.sources.length }} · 命中 {{ filteredHits.length }}</span>
      <button
        class="wb-wl__refresh"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? '刷新中…' : '手动刷新招标信息'"
        @click="refresh(true)"
      >
        <AppIcon name="refresh-cw" :size="13" :class="{ spin: refreshing }" />
      </button>
    </template>
    <div class="wb-bidding">
      <!-- 抓取失败源提示：定位「刷新抓不到新数据」的根因（如 browser 源缺无头浏览器） -->
      <div v-if="failedStatuses.length" class="wb-bidding__warn">
        <AppIcon name="alert-triangle" :size="14" />
        <span>{{ failedStatuses.length }} 个抓取源本次失败：</span>
        <ul>
          <li v-for="s in failedStatuses" :key="s.name">
            <b>{{ s.name }}</b><span v-if="s.error"> — {{ s.error }}</span>
          </li>
        </ul>
      </div>
      <!-- 命中文章（抓取源在「招标信息 · 设置」中管理） -->
      <div class="wb-bidding__hits">
        <div class="wb-sub wb-sub--row wb-bidding__filters">
          <div class="wb-bidding__filter-group">
            <span>数据源</span>
            <div class="wb-tabs">
              <button
                v-for="s in sourceTabs"
                :key="String(s.key)"
                class="wb-tab"
                :class="{ 'is-active': sourceTab === s.key }"
                @click="sourceTab = s.key"
              >{{ s.label }}<span v-if="s.count" class="wb-tab__count">{{ s.count }}</span></button>
            </div>
          </div>
          <div class="wb-bidding__filter-group">
            <span>最新命中</span>
            <div class="wb-tabs">
              <button
                v-for="t in TABS"
                :key="t.key"
                class="wb-tab"
                :class="{ 'is-active': tab === t.key }"
                @click="tab = t.key"
              >{{ t.label }}</button>
            </div>
          </div>
        </div>
        <div v-if="loading" class="wb-muted">加载中…</div>
        <ul v-else class="wb-hits">
          <li v-for="h in filteredHits" :key="h.id" class="wb-hit">
            <a class="wb-hit__title" :href="h.url" target="_blank" rel="noopener">
              <template v-for="(seg, i) in segments(h.title || '', h.keywords)" :key="i">
                <mark v-if="seg.hit" class="wb-hit__hl">{{ seg.t }}</mark>
                <template v-else>{{ seg.t }}</template>
              </template>
            </a>
            <div class="wb-muted wb-hit__meta">
              <span v-if="h.titleHit === false" class="wb-hit__badge" title="关键词命中在正文（站点全文搜索结果）">正文命中</span>
              <span v-else-if="h.titleHit === true && (h.keywords || []).length" class="wb-hit__badge wb-hit__badge--title" title="关键词命中在标题">标题命中</span>
              {{ h.sourceName || h.source }} · {{ h.publishedAt }}
              <template v-if="h.budget"> · 预算 {{ h.budget }}</template>
              <template v-if="h.deadline"> · 截止 {{ h.deadline }}</template>
            </div>
            <div v-if="h.bodyAvailable" class="wb-hit__summary">{{ truncate(h.body || '') }}</div>
            <div v-else-if="h.bodyAvailable === false" class="wb-hit__summary wb-hit__nobody">正文不可获取</div>
            <div v-else class="wb-hit__summary">{{ h.summary }}</div>
            <div v-if="contextSegments(h).length" class="wb-hit__ctx">
              <template v-for="(seg, i) in contextSegments(h)" :key="i">
                <span v-if="seg.hit" class="wb-hit__kw">{{ seg.t }}</span>
                <template v-else>{{ seg.t }}</template>
              </template>
            </div>
          </li>
        </ul>
        <div v-if="!loading && filteredHits.length === 0" class="wb-muted" style="font-size: .85rem">
          <template v-if="noSources">尚未配置抓取源，请点右上角齿轮 → 招标信息 · 设置，在「抓取源」中添加</template>
          <template v-else>{{ emptyHint }}</template>
        </div>
      </div>
    </div>
  </WbCard>
</template>
