<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore, type Holding } from '@/stores/workbench'
import { workbenchApi, type MarketItem, type IpoItem } from '@/api/workbench'
import { isMarketOpen } from '@/utils/market'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const wcfg = computed(() => wb.instConfig(props.iid) || {})

interface Row {
  id: number
  name: string
  code: string
  buyPrice: number
  shares: number
  current: number
  prevClose: number
  changeAmount: number // 涨跌金额 = 现价 - 昨收
  changePct: number // 涨跌幅 %
  dailyPnl: number // 当天收益 = (现价 - 昨收) × 股数
  totalPnl: number // 总收益 = (现价 - 买入价) × 股数
  totalPct: number // 总收益率 %
  amount: number // 持仓金额 = 买入价 × 股数
  costDate: string // 建仓日期
}

const holdings = computed(() => wcfg.value.holdings)

const rows = computed<Row[]>(() =>
  holdings.value.map((h) => {
    const current = h.current ?? 0
    const prevClose = h.prevClose ?? 0
    const changeAmount = current - prevClose
    const changePct = prevClose ? (changeAmount / prevClose) * 100 : 0
    const dailyPnl = changeAmount * h.shares
    const totalPnl = (current - h.buyPrice) * h.shares
    const totalPct = h.buyPrice ? ((current - h.buyPrice) / h.buyPrice) * 100 : 0
    return {
      id: h.id,
      name: h.name || h.code,
      code: h.code,
      buyPrice: h.buyPrice,
      shares: h.shares,
      current,
      prevClose,
      changeAmount,
      changePct,
      dailyPnl,
      totalPnl,
      totalPct,
      amount: h.buyPrice * h.shares,
      costDate: h.costDate || '',
    }
  })
)

const totals = computed(() => {
  let d = 0
  let t = 0
  let a = 0
  rows.value.forEach((r) => {
    d += r.dailyPnl
    t += r.totalPnl
    a += r.amount
  })
  return { d, t, a }
})

function money(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2)
}
function pct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function hasQuote(r: Row): boolean {
  return r.current > 0
}

const loadingMarket = ref(false)
const lastSync = ref('')

// 刷新实时行情：调用后端 /api/stock（腾讯财经），更新各持仓现价、昨收、名称
// 公开 API 无参数（供 watch 与 @click 调用）；行情源偶发抖动时内部补拉一次。
async function refreshMarket() {
  await _refreshOnce(true)
}

async function _refreshOnce(allowRetry: boolean) {
  const codes = holdings.value.map((h) => h.code).filter(Boolean)
  if (!codes.length || loadingMarket.value) return
  loadingMarket.value = true
  try {
    const items: MarketItem[] = await workbenchApi.market(codes)
    const map = new Map(items.map((i) => [i.code, i]))
    let applied = 0
    for (const h of holdings.value) {
      const m = map.get(h.code)
      if (m) {
        const patch: Partial<Holding> = { current: m.price, prevClose: m.prevClose }
        if (m.name) patch.name = m.name
        wb.updateHolding(props.iid, h.id, patch)
        applied++
      }
    }
    lastSync.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    // 行情源偶发抖动导致部分缺失：最多补拉一次
    if (allowRetry && applied < codes.length) {
      window.setTimeout(() => _refreshOnce(false), 1200)
    }
  } catch {
    if (allowRetry) window.setTimeout(() => _refreshOnce(false), 1200)
  } finally {
    loadingMarket.value = false
  }
}

// 持仓列表变化（增 / 删）时自动拉取行情；初次挂载也拉一次。
// 更新行情只改 current/prevClose/name，不改变 code，故不会触发重复刷新（无死循环）。
watch(() => holdings.value.map((h) => h.code).join(','), refreshMarket, { immediate: true })

// —— 开市时段自动刷新 ——
// 仅当设置开启、且当前处于 A 股开市时段（周一至周五 9:30–11:30 / 13:00–15:00，非法定节假日）时，
// 按配置间隔轮询行情；休市期间定时器持续运行但空转，开市瞬间立即补刷一次。
// 行情写入 store 即触发 computed 重算，卡片实时刷新，无需刷新整个网页。
const autoCfg = computed(() => wcfg.value.autoRefresh)
// 实时开市状态（每个 tick 更新），驱动卡片徽标即时反映开/休市，无需等待行情刷新
const marketOpen = ref(isMarketOpen())
const autoActive = computed(() => autoCfg.value.enabled && marketOpen.value)

let timerId: ReturnType<typeof setInterval> | null = null
let lastSyncTs = 0
let wasOpen = false
let stopAutoWatch: (() => void) | null = null

function stopAuto() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function startAuto() {
  stopAuto()
  const cfg = autoCfg.value
  if (!cfg.enabled || !cfg.interval) return
  const intervalMs = cfg.interval * 1000
  // 检测节拍：不小于 1s、不超过 30s（间隔很大时也能及时感知开/休市切换），同时不超过配置间隔
  const tickMs = Math.max(1000, Math.min(intervalMs, 30000))
  timerId = window.setInterval(() => {
    const open = isMarketOpen()
    marketOpen.value = open
    const now = Date.now()
    if (!open) {
      // 休市：复位，开市后首个 tick 立即刷新
      wasOpen = false
      lastSyncTs = now
      return
    }
    if (!wasOpen) {
      // 开市瞬间：立即补刷一次
      wasOpen = true
      lastSyncTs = now
      void refreshMarket()
      return
    }
    if (now - lastSyncTs >= intervalMs) {
      lastSyncTs = now
      void refreshMarket()
    }
  }, tickMs)
}

onMounted(() => {
  startAuto()
  // 配置变更（开关 / 间隔）→ 重新建立定时器
  stopAutoWatch = watch(autoCfg, () => startAuto(), { deep: true })
  // 新股申购日历：挂载即拉取，每 30 分钟刷新一次（日历日级变化，无需更频繁）
  void loadIpo()
  ipoTimer = window.setInterval(loadIpo, 30 * 60 * 1000)
})

onUnmounted(() => {
  stopAuto()
  if (stopAutoWatch) stopAutoWatch()
  if (ipoTimer !== null) clearInterval(ipoTimer)
})

// —— 新股申购日历角标 + 弹窗 ——
const ipoData = ref<{ today: IpoItem[]; week: IpoItem[]; all: IpoItem[]; error?: string } | null>(null)
const ipoLoading = ref(false)
const ipoOpen = ref(false)
let ipoTimer: number | null = null

async function loadIpo() {
  if (ipoLoading.value) return
  ipoLoading.value = true
  try {
    ipoData.value = await workbenchApi.ipo()
  } catch {
    ipoData.value = { today: [], week: [], all: [], error: 'fetch_failed' }
  } finally {
    ipoLoading.value = false
  }
}
const ipoTodayCount = computed(() => ipoData.value?.today.length ?? 0)
const ipoWeekCount = computed(() => ipoData.value?.week.length ?? 0)
const ipoBadge = computed(() => {
  if (!ipoData.value) return null
  if (ipoTodayCount.value === 0 && ipoWeekCount.value === 0) return null
  return `【新股：今${ipoTodayCount.value}；周${ipoWeekCount.value}】`
})
// 弹窗优先展示「未来一周可申购」，为空则回退「全部待申购」
const ipoModalList = computed<IpoItem[]>(() => {
  const d = ipoData.value
  if (!d) return []
  return d.week.length ? d.week : d.all
})

const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
/**
 * 计算申购日期的相对标注（按当天本地日期计算，无需实时时钟）。
 * - 近三天（0/1/2 天）→ 今天 / 明天 / 后天，红色（wb-ipo__rel--near）
 * - 三天以外 → N天后，绿色（wb-ipo__rel--far）
 * - 已过期 → 已过，灰色（wb-ipo__rel--past）
 */
function ipoApplyInfo(dateStr: string | undefined) {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return null
  const target = new Date(+m[1], +m[2] - 1, +m[3]) // 本地零时
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  const weekday = WEEK_LABEL[target.getDay()]
  if (diff < 0) return { weekday, rel: '已过', cls: 'wb-ipo__rel--past' }
  if (diff === 0) return { weekday, rel: '今天', cls: 'wb-ipo__rel--near' }
  if (diff === 1) return { weekday, rel: '明天', cls: 'wb-ipo__rel--near' }
  if (diff === 2) return { weekday, rel: '后天', cls: 'wb-ipo__rel--near' }
  return { weekday, rel: `${diff}天后`, cls: 'wb-ipo__rel--far' }
}

/** 依据股票代码推断板块标签（创业板 / 科创板 / 沪市 / 深市 / 北交所） */
function ipoBoardTag(code: string | undefined): string {
  if (!code) return ''
  const c = code.trim()
  if (/^68[89]/.test(c)) return '科创板'
  if (/^30/.test(c)) return '创业板'
  if (/^[89]|^92/.test(c)) return '北交所'
  if (/^60/.test(c)) return '沪市'
  if (/^00/.test(c)) return '深市'
  return ''
}
</script>

<template>
  <WbCard :iid="iid" icon="trending-up">
    <template #meta>
      <span v-if="autoActive" class="wb-wl__auto" title="开市时段自动刷新中">自动 · {{ autoCfg.interval }}s</span>
      <span v-else-if="autoCfg.enabled" class="wb-wl__auto wb-wl__auto--off" title="已开启，但当前为休市时段">休市</span>
      <button
        v-if="ipoBadge"
        class="wb-wl__ipo"
        type="button"
        :title="`今日可申购 ${ipoTodayCount} 只，未来一周可申购 ${ipoWeekCount} 只，点击查看详情`"
        @click="ipoOpen = true"
      >{{ ipoBadge }}</button>
      <span v-if="lastSync" class="wb-wl__sync">已同步 {{ lastSync }}</span>
      <button
        class="wb-wl__refresh"
        type="button"
        :disabled="loadingMarket"
        :title="loadingMarket ? '刷新中…' : '刷新行情'"
        @click="refreshMarket"
      >
        <AppIcon name="refresh-cw" :size="13" :class="{ spin: loadingMarket }" />
      </button>
    </template>
    <div class="wb-wl">
      <div v-for="r in rows" :key="r.id" class="wb-wl__row">
        <div class="wb-wl__line1">
          <span class="wb-wl__name">{{ r.name }}<span class="wb-wl__code">{{ r.code }}</span></span>
          <div class="wb-wl__pos">
            <span>买入 <b>{{ r.buyPrice.toFixed(2) }}</b></span>
            <span>持仓 <b>{{ r.shares }}</b></span>
            <span>金额 <b>{{ r.amount.toFixed(2) }}</b></span>
            <span>建仓 <b>{{ r.costDate || '—' }}</b></span>
          </div>
        </div>
        <div v-if="hasQuote(r)" class="wb-wl__line2">
          <span class="wb-wl__lv"><i>现价</i> <b>{{ r.current.toFixed(2) }}</b></span>
          <span class="wb-wl__lv"><i>日涨跌</i> <b :class="r.changeAmount >= 0 ? 'up' : 'down'">{{ money(r.changeAmount) }}<span class="wb-wl__pnl">（{{ money(r.dailyPnl) }}）</span></b></span>
          <span class="wb-wl__lv"><i>涨跌幅</i> <b :class="r.changePct >= 0 ? 'up' : 'down'">{{ pct(r.changePct) }}</b></span>
          <span class="wb-wl__lv"><i>总收益</i> <b :class="r.totalPnl >= 0 ? 'up' : 'down'">{{ money(r.totalPnl) }}</b></span>
          <span class="wb-wl__lv"><i>收益率</i> <b :class="r.totalPct >= 0 ? 'up' : 'down'">{{ pct(r.totalPct) }}</b></span>
        </div>
        <div v-else class="wb-wl__line2 wb-wl__line2--muted">
          <span class="wb-muted">行情加载中…</span>
        </div>
      </div>
      <div v-if="rows.length === 0" class="wb-muted" style="font-size:.85rem">
        点击右上角齿轮添加自选股（代码 / 买入价 / 股数），行情自动获取
      </div>
    </div>
    <div v-if="rows.length" class="wb-wl__sub" style="margin-top:.6rem; justify-content: space-between">
      <span>合计当日：<b :class="totals.d >= 0 ? 'wb-wl__pl up' : 'wb-wl__pl down'">{{ money(totals.d) }}</b></span>
      <span>合计总收益：<b :class="totals.t >= 0 ? 'wb-wl__pl up' : 'wb-wl__pl down'">{{ money(totals.t) }}</b></span>
      <span>总持仓金额：<b class="wb-wl__amount">{{ totals.a.toFixed(2) }}</b></span>
    </div>

    <!-- 新股申购详情弹窗 -->
    <div v-if="ipoOpen" class="wb-ipo__mask" @click.self="ipoOpen = false">
      <div class="wb-ipo__dialog">
        <div class="wb-ipo__head">
          <span>新股申购</span>
          <button class="wb-ipo__close" type="button" aria-label="关闭" @click="ipoOpen = false">✕</button>
        </div>
        <div v-if="ipoLoading" class="wb-muted" style="padding:.8rem">加载中…</div>
        <ul v-else class="wb-ipo__list">
          <li v-for="it in ipoModalList" :key="it.code" class="wb-ipo__item">
            <div class="wb-ipo__name">
              <span v-if="ipoBoardTag(it.code)" class="wb-ipo__board">{{ ipoBoardTag(it.code) }}</span>
              {{ it.name }}<span class="wb-ipo__code">{{ it.code }}</span>
            </div>
            <div class="wb-ipo__meta">
              <span>申购 <b>{{ it.applyDate }}</b><span v-if="ipoApplyInfo(it.applyDate)" class="wb-ipo__weekday">{{ ipoApplyInfo(it.applyDate)?.weekday }}</span><span v-if="ipoApplyInfo(it.applyDate)" :class="ipoApplyInfo(it.applyDate)?.cls">（{{ ipoApplyInfo(it.applyDate)?.rel }}）</span></span>
              <span v-if="it.payDate">缴款 <b>{{ it.payDate }}</b></span>
              <span v-if="it.listDate">上市 <b>{{ it.listDate }}</b></span>
              <span>发行价：<b>{{ it.price || '暂无' }}</b></span>
            </div>
          </li>
          <li v-if="!ipoModalList.length" class="wb-muted wb-ipo__empty">未来一周暂无新股申购</li>
        </ul>
      </div>
    </div>
  </WbCard>
</template>
