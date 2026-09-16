<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore, type Holding } from '@/stores/workbench'
import { workbenchApi, type MarketItem } from '@/api/workbench'
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
})

onUnmounted(() => {
  stopAuto()
  if (stopAutoWatch) stopAutoWatch()
})
</script>

<template>
  <WbCard :iid="iid" icon="trending-up">
    <template #meta>
      <span v-if="autoActive" class="wb-wl__auto" title="开市时段自动刷新中">自动 · {{ autoCfg.interval }}s</span>
      <span v-else-if="autoCfg.enabled" class="wb-wl__auto wb-wl__auto--off" title="已开启，但当前为休市时段">休市</span>
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
          <span class="wb-wl__lv"><i>日涨跌</i> <b :class="r.changeAmount >= 0 ? 'up' : 'down'">{{ money(r.changeAmount) }}</b></span>
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
  </WbCard>
</template>
