<script setup lang="ts">
import { computed, ref, reactive, onMounted, nextTick } from 'vue'
import Sortable from 'sortablejs'
import {
  useWorkbenchStore,
  WIDGET_META,
  describeDayCount,
  nextDayCountDate,
  GRID_COLS,
  WORLDCLOCK_PRESETS,
  cityFlagUrl,
  cityIso,
  TOOL_META,
  HOTLIST_SRCS,
  HOTLIST_LIMITS,
  HOTLIST_INTERVALS,
  HOTLIST_PROVIDERS,
  HOTLIST_LAYOUTS,
  type CardId,
  type CountdownTarget,
  type DayCountEvent,
  type DayCountRepeat,
  type Holding,
  type LinkItem,
  type ToolId,
  type WorldCity,
} from '@/stores/workbench'
import type { BiddingSource } from '@/api/workbench'
import AppIcon from './AppIcon.vue'
import WbSwitch from './WbSwitch.vue'
import WbSelect from './WbSelect.vue'
import { hotlistLogo } from '@/assets/hotlist'
import { readIconFile } from '@/utils/iconUpload'

const props = defineProps<{ iid: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const wb = useWorkbenchStore()
const instType = computed(() => wb.getInst(props.iid)?.type)
const cfg = computed(() => wb.instConfig(props.iid) || {})

const CARD_NAME: Record<CardId, string> = {
  time: '时间',
  weather: '天气 / 资讯',
  countdown: '倒计时',
  daycount: '倒数日',
  calendar: '日历',
  todo: '待办事项',
  note: '记事本',
  watchlist: '自选股',
  tools: '实用工具箱',
  bidding: '招标信息',
  links: '常用链接',
  hotlist: '实时热搜',
  worldclock: '世界时间',
}

// 尺寸下拉：宽度 1~GRID_COLS（9）、高度 1~5，自由组合 45 种
const WIDTHS = Array.from({ length: GRID_COLS }, (_, i) => i + 1)
const HEIGHTS = [1, 2, 3, 4, 5]
// 待办分类直接来自 store（设置页可增删 / 改名 / 拖拽排序），默认三分类由 store 初始化

const cur = computed(() => wb.getInstSize(props.iid))
function setW(w: number) {
  wb.setInstSize(props.iid, w, cur.value.h)
}
function setH(h: number) {
  wb.setInstSize(props.iid, cur.value.w, h)
}
// 尺寸下拉选项 + v-model 适配（自定义下拉框 WbSelect 用数值 value）
const widthOpts = WIDTHS.map((w) => ({ label: `${w} 列`, value: w }))
const heightOpts = HEIGHTS.map((h) => ({ label: `${h} 行`, value: h }))
const widthModel = computed({
  get: () => cur.value.w,
  set: (v: string | number) => setW(Number(v)),
})
const heightModel = computed({
  get: () => cur.value.h,
  set: (v: string | number) => setH(Number(v)),
})
// 各卡下拉选项
const cdKindOpts = [
  { label: '每天某时刻', value: 'daily' },
  { label: '指定日期', value: 'date' },
]
const weatherModeOpts = [
  { label: '间隔刷新', value: 'interval' },
  { label: '指定时间刷新', value: 'schedule' },
]
const weatherIntervalOpts = [
  { label: '10 分钟', value: 10 },
  { label: '1 小时', value: 60 },
  { label: '6 小时', value: 360 },
  { label: '12 小时', value: 720 },
  { label: '24 小时', value: 1440 },
]
const todoCatOpts = computed(() => cfg.value.categories.map((c) => ({ label: c, value: c })))
const noteSortOpts = [
  { label: '最近修改', value: 'updatedAt' },
  { label: '标题', value: 'title' },
]
const wlIntervalOpts = [
  { label: '1 秒', value: 1 },
  { label: '10 秒', value: 10 },
  { label: '30 秒', value: 30 },
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '10 分钟', value: 600 },
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
]
const hotlistSrcOpts = HOTLIST_SRCS.map((s) => ({ label: s.label, value: s.value }))
const hotlistLimitOpts = HOTLIST_LIMITS.map((n) => ({ label: `${n} 条`, value: n }))
const hotlistIntervalOpts = HOTLIST_INTERVALS.map((n) => ({
  label: n < 60 ? `${n} 秒` : `${n / 60} 分钟`,
  value: n,
}))
const hotlistProviderOpts = HOTLIST_PROVIDERS.map((p) => ({ label: p.label, value: p.value }))
const hotlistLayoutOpts = HOTLIST_LAYOUTS.map((l) => ({ label: l.label, value: l.value }))
const fetchIntervalOpts = [
  { label: '2 小时', value: 120 },
  { label: '8 小时', value: 480 },
  { label: '12 小时', value: 720 },
  { label: '24 小时', value: 1440 },
  { label: '48 小时', value: 2880 },
]
const srcTypeOpts = [
  { label: 'HTML 列表页', value: 'html' },
  { label: 'JSON 接口', value: 'api' },
  { label: 'RSS 订阅', value: 'rss' },
  { label: '浏览器渲染（反爬 SPA）', value: 'browser' },
]

// —— 倒计时新增 ——
const cdLabel = ref('')
const cdKind = ref<'daily' | 'date'>('daily')
const cdValue = ref('18:00')
function addCd() {
  const label = cdLabel.value.trim()
  if (!label) return
  if (cdKind.value === 'daily' && !/^\d{1,2}:\d{2}$/.test(cdValue.value)) return
  if (cdKind.value === 'date' && !cdValue.value) return
  wb.addCountdownTarget(props.iid, { label, kind: cdKind.value, value: cdValue.value })
  cdLabel.value = ''
  cdValue.value = '18:00'
}
function removeCd(id: number) {
  wb.removeCountdownTarget(props.iid, id)
}

// —— 倒数日 ——
const dcLabel = ref('')
const dcRepeat = ref<DayCountRepeat>('once')
const dcDate = ref('') // once: YYYY-MM-DD
const dcMonth = ref(1) // yearly
const dcDay = ref(1) // yearly / monthly
const dcWday = ref(0) // weekly 0-6
const dcHasColor = ref(false)
const dcColor = ref('#f59e0b')
const dcEditingId = ref<number | null>(null)

const dcRepeatOpts = [
  { label: '单次事件', value: 'once' },
  { label: '每年重复（如生日）', value: 'yearly' },
  { label: '每月重复（如还款日）', value: 'monthly' },
  { label: '每周重复（如健身日）', value: 'weekly' },
]
const dcMonthOpts = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} 月`, value: i + 1 }))
const dcDayOpts = Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1} 日`, value: i + 1 }))
const dcWdayOpts = ['日', '一', '二', '三', '四', '五', '六'].map((d, i) => ({ label: `周${d}`, value: i }))

function buildDc(): Omit<DayCountEvent, 'id'> {
  const base: Record<string, unknown> = {
    label: dcLabel.value.trim(),
    repeat: dcRepeat.value,
    color: dcHasColor.value ? dcColor.value : undefined,
  }
  if (dcRepeat.value === 'once') base.date = dcDate.value
  else if (dcRepeat.value === 'yearly') {
    base.month = dcMonth.value
    base.day = dcDay.value
  } else if (dcRepeat.value === 'monthly') base.day = dcDay.value
  else if (dcRepeat.value === 'weekly') base.wday = dcWday.value
  return base as Omit<DayCountEvent, 'id'>
}

function saveDc() {
  if (!dcLabel.value.trim()) return
  const ev = buildDc()
  if (dcEditingId.value != null) {
    wb.updateDayCountEvent(props.iid, dcEditingId.value, ev)
  } else {
    wb.addDayCountEvent(props.iid, ev)
  }
  resetDc()
}

function resetDc() {
  dcEditingId.value = null
  dcLabel.value = ''
  dcRepeat.value = 'once'
  dcDate.value = ''
  dcMonth.value = 1
  dcDay.value = 1
  dcWday.value = 0
  dcHasColor.value = false
  dcColor.value = '#f59e0b'
}

function editDc(e: DayCountEvent) {
  dcEditingId.value = e.id
  dcLabel.value = e.label
  dcRepeat.value = e.repeat
  dcDate.value = e.date || ''
  dcMonth.value = e.month || 1
  dcDay.value = e.day || 1
  dcWday.value = e.wday ?? 0
  dcHasColor.value = !!e.color
  dcColor.value = e.color || '#f59e0b'
}

function removeDc(id: number) {
  wb.removeDayCountEvent(props.iid, id)
  if (dcEditingId.value === id) resetDc()
}

/** 计算该事件下一次到来的具体日期（YYYY-MM-DD），用于设置列表展示 */
function dcDateStr(e: DayCountEvent): string {
  const r = nextDayCountDate(e)
  if (!r.target) return ''
  const t = r.target
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const d = String(t.getDate()).padStart(2, '0')
  return `${t.getFullYear()}-${m}-${d}`
}

// —— 倒数日 / 世界时间：事件行间距（px），未设置回退默认 8 ——
const dcLineGap = computed(() => {
  const g = (cfg.value as { lineGap?: number }).lineGap
  return Number.isFinite(g) ? (g as number) : 8
})
const dcLineGapPx = computed(() => `${dcLineGap.value}px`)

// —— 倒数日事件拖拽排序（仅本设置页，复用 reorderDayCountEvents；排序随 store 自动落盘）——
const dcListRef = ref<HTMLElement | null>(null)
let dcSortable: Sortable | null = null
watch(
  () => instType.value === 'daycount',
  async (isDc) => {
    await nextTick()
    if (isDc && dcListRef.value && !dcSortable) {
      dcSortable = Sortable.create(dcListRef.value, {
        animation: 160,
        handle: '.wb-dcl__handle',
        ghostClass: 'wb-dcl__ghost',
        onEnd: () => {
          if (!dcListRef.value) return
          const ids = Array.from(dcListRef.value.querySelectorAll('.wb-dcl__item'))
            .map((el) => Number((el as HTMLElement).dataset.id))
            .filter((n) => !Number.isNaN(n))
          if (ids.length) wb.reorderDayCountEvents(props.iid, ids)
        },
      })
    } else if (!isDc && dcSortable) {
      dcSortable.destroy()
      dcSortable = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  dcSortable?.destroy()
  dcSortable = null
})
const wcLineGap = computed(() => {
  const g = (cfg.value as { lineGap?: number }).lineGap
  return Number.isFinite(g) ? (g as number) : 8
})
const wcLineGapPx = computed(() => `${wcLineGap.value}px`)

// —— 日历间距钳制 ——
function clampGap(n: number): number {
  if (!Number.isFinite(n)) return 2
  return Math.max(0, Math.min(16, Math.round(n)))
}
// —— 工具箱间距钳制（上限放宽到 24px，图标网格间距跨度更大）——
function clampToolGap(n: number): number {
  if (!Number.isFinite(n)) return 10
  return Math.max(0, Math.min(24, Math.round(n)))
}

// —— 招标抓取源新增 ——
const newSrcType = ref<'html' | 'api' | 'rss' | 'browser'>('html')
const newSrcName = ref('')
const newSrcUrl = ref('')
const newSrcKw = ref('')
const newSrcSearch = ref('')
const newSrcApiUrl = ref('')
const newSrcItemPath = ref('')
// api 源鉴权（type='api' 且接口需携带 Key/Token 时填写）
const newSrcApiKey = ref('')
const newSrcApiHeader = ref('')
const newF = ref({ title: '', url: '', date: '', summary: '', body: '' })
// 浏览器渲染模式（type='browser'）字段
const newItemSel = ref('')
const newTitleSel = ref('')
const newSumSel = ref('')
const newDateRegex = ref('')
const newBaseUrl = ref('')
// 关键词搜索选择器（驱动站点搜索框；ctbpsp 等反爬 SPA 用此抓取「按关键词命中」的结果）
const newSearchInputSel = ref('')
const newSearchBtnSel = ref('')
// 「全文/标题」搜索切换开关选择器（如 Element UI 的 '.el-switch.switchStyle'）；
// 配置后浏览器脚本会在关键词搜索开始前确保开关处于「OFF/全文」模式
const newSearchToggleSel = ref('')
// ctbpsp 预设：一键填入已知可用的反爬 SPA 选择器（用户也可自行改）
function fillCtbpspPreset() {
  newSrcUrl.value = 'https://ctbpsp.com/'
  newSrcName.value = '中招公共服务平台（ctbpsp）'
  newItemSel.value = 'div.left_body'
  newTitleSel.value = 'p.left_body_name'
  newSumSel.value = 'span.btncas'
  newDateRegex.value = '接收时间[:：]\\s*(\\d{4}-\\d{2}-\\d{2})'
  newBaseUrl.value = 'https://ctbpsp.com/'
  newSearchInputSel.value = 'input[type="text"]'
  newSearchBtnSel.value = 'button.btns'
  // ctbpsp 搜索框下方有「搜标题/搜全文」滑动开关，默认是「搜标题」ON（aria-checked="true"）；
  // 配此选择器后，浏览器脚本会把它 OFF 化一次，保证关键词能搜全文而非只匹配标题。
  newSearchToggleSel.value = '.el-switch.switchStyle'
}
function addSrc() {
  const kws = newSrcKw.value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const name = newSrcName.value.trim()
  if (newSrcType.value === 'rss') {
    const url = newSrcUrl.value.trim()
    if (!url) return
    wb.addBiddingSource(props.iid, url, kws, true, '', name, 'rss', '', '', {})
  } else if (newSrcType.value === 'api') {
    const apiUrl = newSrcApiUrl.value.trim()
    if (!apiUrl) return
    wb.addBiddingSource(props.iid, '', kws, true, '', name, 'api', apiUrl, newSrcItemPath.value.trim(), { ...newF.value }, {}, {
      apiKey: newSrcApiKey.value,
      apiHeader: newSrcApiHeader.value,
    })
  } else if (newSrcType.value === 'browser') {
    const url = newSrcUrl.value.trim()
    if (!url) return
    wb.addBiddingSource(props.iid, url, kws, false, '', name, 'browser', '', '', {}, {
      itemSelector: newItemSel.value,
      titleSelector: newTitleSel.value,
      summarySelector: newSumSel.value,
      dateRegex: newDateRegex.value,
      baseUrl: newBaseUrl.value,
      searchInputSelector: newSearchInputSel.value,
      searchButtonSelector: newSearchBtnSel.value,
      searchFullTextToggleSelector: newSearchToggleSel.value,
    })
  } else {
    const url = newSrcUrl.value.trim()
    if (!url) return
    wb.addBiddingSource(props.iid, url, kws, true, newSrcSearch.value.trim(), name, 'html', '', '', {})
  }
  newSrcType.value = 'html'
  newSrcName.value = ''
  newSrcUrl.value = ''
  newSrcKw.value = ''
  newSrcSearch.value = ''
  newSrcApiUrl.value = ''
  newSrcItemPath.value = ''
  newSrcApiKey.value = ''
  newSrcApiHeader.value = ''
  newF.value = { title: '', url: '', date: '', summary: '', body: '' }
  newItemSel.value = ''
  newTitleSel.value = ''
  newSumSel.value = ''
  newDateRegex.value = ''
  newBaseUrl.value = ''
  newSearchInputSel.value = ''
  newSearchBtnSel.value = ''
  newSearchToggleSel.value = ''
}

// —— 招标抓取源编辑（内联）——
const editSrcId = ref<number | null>(null)
const editSrcType = ref<'html' | 'api' | 'rss' | 'browser'>('html')
const editSrcName = ref('')
const editSrcUrl = ref('')
const editSrcKw = ref('')
const editSrcSearch = ref('')
const editSrcApiUrl = ref('')
const editSrcItemPath = ref('')
const editSrcApiKey = ref('')
const editSrcApiHeader = ref('')
const editF = ref({ title: '', url: '', date: '', summary: '', body: '' })
// 浏览器渲染模式（type='browser'）字段
const editItemSel = ref('')
const editTitleSel = ref('')
const editSumSel = ref('')
const editDateRegex = ref('')
const editBaseUrl = ref('')
const editSearchInputSel = ref('')
const editSearchBtnSel = ref('')
const editSearchToggleSel = ref('')
function startEditSrc(s: BiddingSource) {
  editSrcId.value = s.id
  editSrcType.value = s.type === 'rss' ? 'rss' : s.type === 'api' ? 'api' : s.type === 'browser' ? 'browser' : 'html'
  editSrcName.value = s.name || ''
  editSrcUrl.value = s.url || ''
  editSrcKw.value = s.keywords.join('，')
  editSrcSearch.value = s.searchUrl || ''
  editSrcApiUrl.value = s.apiUrl || ''
  editSrcItemPath.value = s.itemPath || ''
  editSrcApiKey.value = s.apiKey || ''
  editSrcApiHeader.value = s.apiHeader || ''
  editF.value = {
    title: s.fields?.title || '',
    url: s.fields?.url || '',
    date: s.fields?.date || '',
    summary: s.fields?.summary || '',
    body: s.fields?.body || '',
  }
  editItemSel.value = s.itemSelector || ''
  editTitleSel.value = s.titleSelector || ''
  editSumSel.value = s.summarySelector || ''
  editDateRegex.value = s.dateRegex || ''
  editBaseUrl.value = s.baseUrl || ''
  editSearchInputSel.value = s.searchInputSelector || ''
  editSearchBtnSel.value = s.searchButtonSelector || ''
  editSearchToggleSel.value = s.searchFullTextToggleSelector || ''
}
function saveEditSrc() {
  if (editSrcId.value === null) return
  const kws = editSrcKw.value
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const name = editSrcName.value.trim()
  if (editSrcType.value === 'rss') {
    const url = editSrcUrl.value.trim()
    if (!url) return
    wb.updateBiddingSource(props.iid, editSrcId.value, url, kws, undefined, '', name, 'rss', '', '', {})
  } else if (editSrcType.value === 'api') {
    const apiUrl = editSrcApiUrl.value.trim()
    if (!apiUrl) return
    wb.updateBiddingSource(props.iid, editSrcId.value, '', kws, undefined, '', name, 'api', apiUrl, editSrcItemPath.value.trim(), { ...editF.value }, {}, {
      apiKey: editSrcApiKey.value,
      apiHeader: editSrcApiHeader.value,
    })
  } else if (editSrcType.value === 'browser') {
    const url = editSrcUrl.value.trim()
    if (!url) return
    wb.updateBiddingSource(props.iid, editSrcId.value, url, kws, undefined, '', name, 'browser', '', '', {}, {
      itemSelector: editItemSel.value,
      titleSelector: editTitleSel.value,
      summarySelector: editSumSel.value,
      dateRegex: editDateRegex.value,
      baseUrl: editBaseUrl.value,
      searchInputSelector: editSearchInputSel.value,
      searchButtonSelector: editSearchBtnSel.value,
      searchFullTextToggleSelector: editSearchToggleSel.value,
    })
  } else {
    const url = editSrcUrl.value.trim()
    if (!url) return
    wb.updateBiddingSource(props.iid, editSrcId.value, url, kws, undefined, editSrcSearch.value.trim(), name, 'html', '', '', {})
  }
  cancelEditSrc()
}
function cancelEditSrc() {
  editSrcId.value = null
  editSrcType.value = 'html'
  editSrcName.value = ''
  editSrcUrl.value = ''
  editSrcKw.value = ''
  editSrcSearch.value = ''
  editSrcApiUrl.value = ''
  editSrcItemPath.value = ''
  editSrcApiKey.value = ''
  editSrcApiHeader.value = ''
  editF.value = { title: '', url: '', date: '', summary: '', body: '' }
  editItemSel.value = ''
  editTitleSel.value = ''
  editSumSel.value = ''
  editDateRegex.value = ''
  editBaseUrl.value = ''
  editSearchInputSel.value = ''
  editSearchBtnSel.value = ''
  editSearchToggleSel.value = ''
}
// 每源「抓取详情页正文」开关
function setSrcBody(s: BiddingSource, v: boolean) {
  s.fetchBody = v
}
// 在浏览器中打开源站（反爬站点自动抓取失败时的兜底：手动查看）
function openSrc(s: BiddingSource) {
  const u = s.type === 'rss'
    ? (s.url || '')
    : s.type === 'api'
      ? (s.apiUrl || '')
      : (s.searchUrl && s.searchUrl.includes('{kw}') && s.keywords.length)
        ? s.searchUrl.replace('{kw}', encodeURIComponent(s.keywords[0]))
        : s.url
  if (u) window.open(u, '_blank', 'noopener')
}

// —— 常用链接新增 / 编辑 ——
const newLinkTitle = ref('')
const newLinkUrl = ref('')
const newLinkIcon = ref('')
const newLinkIconUrl = ref('') // 图标图片链接（http(s)，可选）
const newLinkIconData = ref('') // 上传图标转成的 data URL（可选）
const editingLinkId = ref<number | null>(null)

function addLk() {
  const url = newLinkUrl.value.trim()
  if (!url) return
  const iconImg = newLinkIconData.value || newLinkIconUrl.value
  wb.addLink(props.iid, newLinkTitle.value, url, newLinkIcon.value, iconImg)
  resetLinkForm()
}
function editLink(l: LinkItem) {
  editingLinkId.value = l.id
  newLinkTitle.value = l.title
  newLinkUrl.value = l.url
  newLinkIcon.value = l.icon === 'link' ? '' : l.icon
  newLinkIconUrl.value = l.iconImg && l.iconImg.startsWith('http') ? l.iconImg : ''
  newLinkIconData.value = l.iconImg && l.iconImg.startsWith('data:') ? l.iconImg : ''
}
function onLinkIconFile(e: Event) {
  readIconFile(e, (d) => (newLinkIconData.value = d))
}
function saveEditLink() {
  if (editingLinkId.value == null) return
  const url = newLinkUrl.value.trim()
  if (!url) return
  const iconImg = newLinkIconData.value || newLinkIconUrl.value
  wb.updateLink(props.iid, editingLinkId.value, {
    title: newLinkTitle.value,
    url,
    icon: newLinkIcon.value,
    iconImg,
  })
  resetLinkForm()
}
function cancelEditLink() {
  resetLinkForm()
}
function resetLinkForm() {
  editingLinkId.value = null
  newLinkTitle.value = ''
  newLinkUrl.value = ''
  newLinkIcon.value = ''
  newLinkIconUrl.value = ''
  newLinkIconData.value = ''
}

// —— 自选股新增（仅需 代码 / 买入价 / 股数；现价、昨收、名称由实时行情填充）——
const newHolding = ref<Omit<Holding, 'id'>>({
  code: '', buyPrice: 0, shares: 0, name: '', prevClose: 0, current: 0, costDate: '',
})
function addHolding() {
  const code = newHolding.value.code.trim()
  const buyPrice = newHolding.value.buyPrice
  const shares = newHolding.value.shares
  if (!code || !(buyPrice > 0) || !(shares > 0)) return
  wb.addHolding(props.iid, { code, buyPrice, shares, name: '', prevClose: 0, current: 0, costDate: newHolding.value.costDate })
  newHolding.value = { code: '', buyPrice: 0, shares: 0, name: '', prevClose: 0, current: 0, costDate: '' }
}

// —— 自选股编辑（复用 newHolding 表单，editingHoldingId 区分新增/编辑）——
const editingHoldingId = ref<number | null>(null)
function editHolding(h: Holding) {
  editingHoldingId.value = h.id
  newHolding.value = {
    code: h.code,
    buyPrice: h.buyPrice,
    shares: h.shares,
    name: h.name || '',
    prevClose: h.prevClose || 0,
    current: h.current || 0,
    costDate: h.costDate || '',
  }
}
function saveEditHolding() {
  if (editingHoldingId.value == null) return
  const code = newHolding.value.code.trim()
  const buyPrice = newHolding.value.buyPrice
  const shares = newHolding.value.shares
  if (!code || !(buyPrice > 0) || !(shares > 0)) return
  wb.updateHolding(props.iid, editingHoldingId.value, { code, buyPrice, shares, costDate: newHolding.value.costDate })
  cancelEditHolding()
}
function cancelEditHolding() {
  editingHoldingId.value = null
  newHolding.value = { code: '', buyPrice: 0, shares: 0, name: '', prevClose: 0, current: 0, costDate: '' }
}

// —— 自选股持仓拖拽排序 ——
const dragId = ref<number | null>(null)
function onDragStart(id: number) {
  dragId.value = id
}
function onDragOver(e: DragEvent, id: number) {
  e.preventDefault()
  if (dragId.value === null || dragId.value === id) return
  const ids = cfg.value.holdings.map((h) => h.id)
  const from = ids.indexOf(dragId.value)
  const to = ids.indexOf(id)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  wb.reorderHolding(props.iid, ids)
}
function onDragEnd() {
  dragId.value = null
}

// —— 常用链接拖拽排序 ——
const dragLinkId = ref<number | null>(null)
function onLinkDragStart(id: number) {
  dragLinkId.value = id
}
function onLinkDragOver(e: DragEvent, id: number) {
  e.preventDefault()
  if (dragLinkId.value === null || dragLinkId.value === id) return
  const ids = cfg.value.items.map((l) => l.id)
  const from = ids.indexOf(dragLinkId.value)
  const to = ids.indexOf(id)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  wb.reorderLink(props.iid, ids)
}
function onLinkDragEnd() {
  dragLinkId.value = null
}

// —— 工具箱：小工具标题开关 / 间距 / 拖拽排序 ——
const toolsShowTitleModel = computed({
  get: () => wb.getShowTitle(props.iid),
  set: (v: boolean) => wb.setShowTitle(props.iid, v),
})
/** 排序列表项（按当前顺序展开成 名称 + 图标） */
const toolList = computed(() =>
  cfg.value.order.map((id) => ({ id, ...TOOL_META[id] })),
)
const dragToolId = ref<ToolId | null>(null)
function onToolDragStart(id: ToolId) {
  dragToolId.value = id
}
function onToolDragOver(e: DragEvent, id: ToolId) {
  e.preventDefault()
  if (!dragToolId.value || dragToolId.value === id) return
  const ids = [...cfg.value.order]
  const from = ids.indexOf(dragToolId.value)
  const to = ids.indexOf(id)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  wb.reorderTools(props.iid, ids)
}
function onToolDragEnd() {
  dragToolId.value = null
}
function resetToolOrder() {
  wb.reorderTools(props.iid, [...wb.DEFAULT_TOOL_ORDER])
}

// —— 滑动开关绑定（复选框 → 开关）——
const showTitleModel = computed({
  get: () => wb.getShowTitle(props.iid),
  set: (v: boolean) => wb.setShowTitle(props.iid, v),
})
// 组件自动高度开关：仅满宽(w≥9)卡片才展示。开启后该卡片高度按内容自适应（由 WorkbenchView 在
// grid-template-rows 把其所在行标为 auto）；关闭（或未开此开关的卡片，如招标信息）严格按网格行高。
const autoHeightModel = computed({
  get: () => !!wb.getAutoHeight(props.iid),
  set: (v: boolean) => wb.setAutoHeight(props.iid, v),
})
const showLunarModel = computed({
  get: () => cfg.value.showLunar,
  set: (v: boolean) => wb.patchInst(props.iid, { showLunar: v }),
})
const autoFillModel = computed({
  get: () => cfg.value.autoFill,
  set: (v: boolean) => wb.patchInst(props.iid, { autoFill: v }),
})
const showDoneModel = computed({
  get: () => cfg.value.showCompleted,
  set: (v: boolean) => wb.patchInst(props.iid, { showCompleted: v }),
})
// 记事：点击遮罩关闭弹窗开关
const noteMaskCloseModel = computed({
  get: () => cfg.value.closeOnMask,
  set: (v: boolean) => wb.patchInst(props.iid, { closeOnMask: v }),
})
// 待办分类管理：新增 / 改名 / 删除 / 拖拽排序（A 项需求）
const newCatName = ref('')
const editingCat = ref<string | null>(null)
const editCatName = ref('')
const dragCatName = ref<string | null>(null)
function addTodoCat() {
  const n = newCatName.value.trim()
  if (!n) return
  wb.addTodoCategory(props.iid, n)
  newCatName.value = ''
}
function startEditCat(name: string) {
  editingCat.value = name
  editCatName.value = name
}
function saveEditCat() {
  if (editingCat.value == null) return
  wb.updateTodoCategory(props.iid, editingCat.value, editCatName.value)
  editingCat.value = null
  editCatName.value = ''
}
function cancelEditCat() {
  editingCat.value = null
  editCatName.value = ''
}
function delTodoCat(name: string) {
  wb.removeTodoCategory(props.iid, name)
}
function onCatDragStart(name: string) {
  dragCatName.value = name
}
function onCatDragOver(e: DragEvent, name: string) {
  e.preventDefault()
  if (!dragCatName.value || dragCatName.value === name) return
  const names = [...cfg.value.categories]
  const from = names.indexOf(dragCatName.value)
  const to = names.indexOf(name)
  if (from < 0 || to < 0) return
  names.splice(to, 0, names.splice(from, 1)[0])
  wb.reorderTodoCategory(props.iid, names)
}
function onCatDragEnd() {
  dragCatName.value = null
}
const autoFetchModel = computed({
  get: () => cfg.value.autoFetch,
  set: (v: boolean) => wb.patchInst(props.iid, { autoFetch: v }),
})
const fetchIntervalModel = computed({
  get: () => cfg.value.fetchInterval,
  set: (v: string | number) => wb.patchInst(props.iid, { fetchInterval: Number(v) }),
})

// —— 自选股：开市时段自动刷新（开关 + 间隔）——
const wlAutoRefreshModel = computed({
  get: () => cfg.value.autoRefresh.enabled,
  set: (v: boolean) =>
    wb.patchInst(props.iid, { autoRefresh: { ...cfg.value.autoRefresh, enabled: v } }),
})
const wlIntervalModel = computed({
  get: () => cfg.value.autoRefresh.interval,
  set: (v: string | number) =>
    wb.patchInst(props.iid, {
      autoRefresh: { ...cfg.value.autoRefresh, interval: Number(v) },
    }),
})

// —— 实时热搜：布局 / 数据源 / 多选平台 / 条数 / 间隔自动刷新 ——
const hotlistLayoutModel = computed({
  get: () => cfg.value.layout,
  set: (v: string) => wb.patchInst(props.iid, { layout: v as 'tabs' | 'columns' }),
})
const hotlistProviderModel = computed({
  get: () => cfg.value.provider,
  set: (v: string) => wb.patchInst(props.iid, { provider: v as any }),
})
// uapis 会员 API Key（走会员通道、更高额度/更高频）；留空则使用访客模式
const uapisKeyModel = computed({
  get: () => cfg.value.uapisKey || '',
  set: (v: string) => wb.patchInst(props.iid, { uapisKey: v.trim() }),
})
// 多选平台：切换即写回 platforms（已选列表的 × 调用它移除）
function toggleHotlistPlatform(value: string) {
  const cur = cfg.value.platforms
  const next = cur.includes(value as any)
    ? cur.filter((p) => p !== value)
    : [...cur, value as any]
  wb.patchInst(props.iid, { platforms: next })
}
// 已选平台（保持用户拖拽/勾选顺序，解析出 label）；可选平台（白名单中未选部分）
const selectedPlatforms = computed(() =>
  cfg.value.platforms
    .map((p) => HOTLIST_SRCS.find((s) => s.value === p))
    .filter((x): x is { value: string; label: string } => Boolean(x))
    .map((s) => ({ value: s.value, label: s.label })),
)
const availablePlatforms = computed(() =>
  HOTLIST_SRCS.filter((s) => !cfg.value.platforms.includes(s.value)),
)
function addHotlistPlatform(value: string) {
  if (cfg.value.platforms.includes(value as any)) return
  wb.patchInst(props.iid, { platforms: [...cfg.value.platforms, value as any] })
}

// 设置页「已选平台」列表拖拽排序：拖完把新顺序写回 store（卡片端按此顺序展示）
const hotlistSelRef = ref<HTMLElement | null>(null)
onMounted(() => {
  if (instType.value !== 'hotlist' || !hotlistSelRef.value) return
  nextTick(() => {
    if (!hotlistSelRef.value) return
    Sortable.create(hotlistSelRef.value, {
      animation: 160,
      ghostClass: 'is-ghost',
      handle: '.wb-plat__handle',
      onEnd: (evt) => {
        const from = evt.oldIndex
        const to = evt.newIndex
        if (from == null || to == null || from === to) return
        const cur = [...cfg.value.platforms]
        const [moved] = cur.splice(from, 1)
        cur.splice(to, 0, moved)
        wb.patchInst(props.iid, { platforms: cur })
      },
    })
  })
})
const hotlistLimitModel = computed({
  get: () => cfg.value.limit,
  set: (v: string | number) => wb.patchInst(props.iid, { limit: Number(v) }),
})
const hotlistAutoModel = computed({
  get: () => cfg.value.autoRefresh,
  set: (v: boolean) => wb.patchInst(props.iid, { autoRefresh: v }),
})
const hotlistIntervalModel = computed({
  get: () => cfg.value.interval,
  set: (v: string | number) => wb.patchInst(props.iid, { interval: Number(v) }),
})

// —— 天气：和风天气 API Key（需自行申请）+ 接入点 Host（可选）——
const weatherApiKeyModel = computed({
  get: () => cfg.value.apiKey || '',
  set: (v: string) => wb.patchInst(props.iid, { apiKey: v }),
})
const weatherHostModel = computed({
  get: () => cfg.value.host || '',
  set: (v: string) => wb.patchInst(props.iid, { host: v }),
})
const weatherAuthModel = computed({
  get: () => (cfg.value.auth === 'jwt' ? true : false),
  set: (v: boolean) => wb.patchInst(props.iid, { auth: v ? 'jwt' : 'key' }),
})

// —— 天气：自动刷新（总开关 / 模式 / 间隔 / 指定时间点，二选一）——
const weatherAutoModel = computed({
  get: () => cfg.value.refreshMode !== 'off',
  set: (v: boolean) => wb.patchInst(props.iid, { refreshMode: v ? 'interval' : 'off' }),
})
const weatherModeModel = computed({
  get: () => (cfg.value.refreshMode === 'schedule' ? 'schedule' : 'interval'),
  set: (v: string | number) =>
    wb.patchInst(props.iid, { refreshMode: v === 'schedule' ? 'schedule' : 'interval' }),
})
const weatherIntervalModel = computed({
  get: () => cfg.value.refreshInterval || 360,
  set: (v: string | number) => wb.patchInst(props.iid, { refreshInterval: Number(v) }),
})
const weatherTimes = computed(() => cfg.value.refreshTimes || [])
const newWeatherTime = ref('08:00')
function addWeatherTime() {
  const t = newWeatherTime.value
  if (!/^\d{1,2}:\d{2}$/.test(t)) return
  const cur = cfg.value.refreshTimes || []
  if (cur.includes(t)) return
  wb.patchInst(props.iid, { refreshTimes: [...cur, t].sort() })
  newWeatherTime.value = '08:00'
}
function removeWeatherTime(t: string) {
  const cur = cfg.value.refreshTimes || []
  wb.patchInst(props.iid, { refreshTimes: cur.filter((x) => x !== t) })
}

// —— 世界时间：自定义显示城市（name + IANA timeZone；预设含 country/iso 用于国旗与「国家·城市」前缀）——
const worldCities = computed(() => cfg.value.cities)
// 国旗图片加载失败（离线等）时按 ISO 代码降级
const wcFlagFailed = reactive<Record<string, boolean>>({})
function onWcFlagErr(c: WorldCity) {
  wcFlagFailed[c.timeZone] = true
}
// 预设中尚未添加的城市（按时区去重，避免重复）
const availablePresets = computed(() =>
  WORLDCLOCK_PRESETS.filter((p) => !worldCities.value.some((c) => c.timeZone === p.timeZone)),
)
function addPresetCity(p: WorldCity) {
  if (worldCities.value.some((c) => c.timeZone === p.timeZone)) return
  wb.patchInst(props.iid, { cities: [...worldCities.value, p] })
}
function removeCity(name: string) {
  wb.patchInst(props.iid, { cities: worldCities.value.filter((c) => c.name !== name) })
}
// 自定义城市：名称 + 国家 + IANA 时区，校验时区可用性
const newCityName = ref('')
const newCityCountry = ref('')
const newCityTz = ref('')
const tzError = ref('')
function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
function addCustomCity() {
  const name = newCityName.value.trim()
  const tz = newCityTz.value.trim()
  const country = newCityCountry.value.trim()
  if (!name || !tz) {
    tzError.value = '请填写城市名称与时区'
    return
  }
  if (!isValidTz(tz)) {
    tzError.value = '时区无效，请填写正确的 IANA 标识（如 Asia/Tokyo、Europe/London）'
    return
  }
  if (worldCities.value.some((c) => c.timeZone === tz)) {
    tzError.value = '该时区已在列表中'
    return
  }
  tzError.value = ''
  // 国家用于国旗与国家标注；iso 优先按国家推导，缺省再按时区推导
  const city: WorldCity = { name, timeZone: tz }
  if (country) city.country = country
  const iso = cityIso(city) || undefined
  if (iso) city.iso = iso
  wb.patchInst(props.iid, { cities: [...worldCities.value, city] })
  newCityName.value = ''
  newCityCountry.value = ''
  newCityTz.value = ''
}
// 已选城市拖拽排序（按数组索引实时换位）
const wcDragIdx = ref<number | null>(null)
function onWcDragStart(i: number) {
  wcDragIdx.value = i
}
function onWcDragOver(e: DragEvent, i: number) {
  e.preventDefault()
  if (wcDragIdx.value === null || wcDragIdx.value === i) return
  const arr = [...worldCities.value]
  const [moved] = arr.splice(wcDragIdx.value, 1)
  arr.splice(i, 0, moved)
  wcDragIdx.value = i
  wb.patchInst(props.iid, { cities: arr })
}
function onWcDragEnd() {
  wcDragIdx.value = null
}
</script>

<template>
  <div class="wb-pop__mask" @click.self="emit('close')">
    <div class="wb-pop">
      <header class="wb-pop__head">
        <div class="wb-pop__title">{{ WIDGET_META[instType]?.name ?? instType }} · 设置</div>
        <button class="wb-cell__btn" @click="emit('close')" aria-label="关闭">
          <AppIcon name="x" :size="16" />
        </button>
      </header>

      <div class="wb-pop__body">
        <!-- 尺寸下拉：宽度 1~9、高度 1~5（所有卡片通用） -->
        <div class="wb-pop__sec">卡片尺寸</div>
        <div class="wb-dims">
          <label class="wb-dim">
            <span>宽度</span>
            <WbSelect :options="widthOpts" v-model="widthModel" />
          </label>
          <label class="wb-dim">
            <span>高度</span>
            <WbSelect :options="heightOpts" v-model="heightModel" :disabled="autoHeightModel" />
          </label>
          <span class="wb-dim__hint">当前 {{ cur.w }}×{{ cur.h }}<template v-if="autoHeightModel">（自适应，高度由内容决定）</template></span>
        </div>

        <!-- 显示选项（所有卡片通用；日历额外含「显示农历 / 自适应撑满」，合并为同一区块） -->
        <div class="wb-pop__sec" style="margin-top: 1rem">显示选项</div>
        <div class="wb-opt">
          <span class="wb-opt__label">显示标题</span>
          <WbSwitch v-model="showTitleModel" />
        </div>
        <div class="wb-opt" v-if="instType === 'calendar'">
          <span class="wb-opt__label">显示农历</span>
          <WbSwitch v-model="showLunarModel" />
        </div>
        <div class="wb-opt" v-if="instType === 'calendar'">
          <span class="wb-opt__label">自适应撑满</span>
          <WbSwitch v-model="autoFillModel" />
        </div>
        <div class="wb-opt" v-if="instType === 'tools'">
          <span class="wb-opt__label">显示小工具标题</span>
          <WbSwitch v-model="toolsShowTitleModel" />
        </div>
        <div class="wb-opt" v-if="cur.w >= 9">
          <span class="wb-opt__label">组件自动高度</span>
          <WbSwitch v-model="autoHeightModel" />
        </div>
        <p v-if="cur.w >= 9" class="wb-muted" style="font-size:.74rem;margin:.3rem 0 0">
          开启后卡片高度按内容自适应（仅满宽卡片可用，由网格在所在行放宽行高实现），关闭则严格按上方固定高度展示。
        </p>

        <!-- 日历 -->
        <template v-if="instType === 'calendar'">
          <div class="wb-pop__sec" style="margin-top: 1rem">网格间距（px）</div>
          <div class="wb-muted" style="font-size: .72rem; margin-bottom: .4rem; opacity: .7">
            开启「自适应撑满」后，行/列间距自动均分卡片区域，以下数值不生效。
          </div>
          <div class="wb-gap2" :class="{ 'is-disabled': autoFillModel }">
            <div class="wb-gap2__col">
              <label>行间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="16"
                step="1"
                :disabled="autoFillModel"
                :value="cfg.rowGap"
                @change="wb.patchInst(props.iid, { rowGap: clampGap(Number(($event.target as HTMLInputElement).value)) })"
              />
            </div>
            <div class="wb-gap2__col">
              <label>列间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="16"
                step="1"
                :disabled="autoFillModel"
                :value="cfg.colGap"
                @change="wb.patchInst(props.iid, { colGap: clampGap(Number(($event.target as HTMLInputElement).value)) })"
              />
            </div>
          </div>
        </template>

        <!-- 倒计时 -->
        <template v-if="instType === 'countdown'">
          <div class="wb-pop__sec">倒计时目标</div>
          <div class="wb-cd__list" style="margin-bottom:.8rem">
            <div v-for="t in cfg.targets" :key="t.id" class="wb-cd__item">
              <div class="wb-cd__label">
                <span>{{ t.label }} · {{ t.kind === 'daily' ? '每天 ' + t.value : t.value }}</span>
                <button class="wb-cell__btn" @click="removeCd(t.id)" aria-label="删除">
                  <AppIcon name="trash-2" :size="14" />
                </button>
              </div>
            </div>
            <div v-if="cfg.targets.length === 0" class="wb-cd__empty">暂无目标</div>
          </div>
          <div class="wb-row">
            <label>名称</label>
            <input class="wb-input" v-model="cdLabel" placeholder="如：距离下班" />
          </div>
          <div class="wb-row">
            <label>类型</label>
            <WbSelect
              :options="cdKindOpts"
              :model-value="cdKind"
              @update:model-value="(v) => (cdKind = v as 'daily' | 'date')"
            />
          </div>
          <div class="wb-row">
            <label>{{ cdKind === 'daily' ? '时间' : '日期' }}</label>
            <input class="wb-input" v-model="cdValue" :type="cdKind === 'daily' ? 'time' : 'date'" />
          </div>
          <button class="btn btn-sm" @click="addCd">添加目标</button>
        </template>

        <!-- 倒数日 -->
        <template v-if="instType === 'daycount'">
          <div class="wb-pop__sec">倒数日事件</div>
          <div class="wb-cd__list wb-dcl" ref="dcListRef" style="margin-bottom:.8rem" :style="{ gap: dcLineGapPx }">
            <div v-for="e in (cfg.events || [])" :key="e.id" :data-id="e.id" class="wb-cd__item wb-dcl__item">
              <button type="button" class="wb-dcl__handle" aria-label="拖拽排序"><AppIcon name="grip-vertical" :size="14" /></button>
              <span class="wb-dcl__txt">
                <span class="wb-dcl__name">{{ e.label }}</span>
                <small class="wb-dcl__meta">{{ dcDateStr(e) }}<template v-if="e.repeat !== 'once'"> · {{ describeDayCount(e) }}</template></small>
              </span>
              <div class="wb-dcl__acts">
                <button class="wb-cell__btn" @click="editDc(e)" aria-label="编辑"><AppIcon name="pencil" :size="14" /></button>
                <button class="wb-cell__btn wb-cell__btn--danger" @click="removeDc(e.id)" aria-label="删除"><AppIcon name="trash-2" :size="14" /></button>
              </div>
            </div>
            <div v-if="!(cfg.events && cfg.events.length)" class="wb-cd__empty">暂无事件</div>
          </div>

          <div class="wb-pop__sec" style="margin-top:1rem">事件行间距（px）</div>
          <div class="wb-row">
            <label>行间距</label>
            <input
              class="wb-input"
              type="number"
              min="0"
              max="32"
              step="1"
              :value="dcLineGap"
              @change="wb.patchInst(props.iid, { lineGap: clampGap(Number(($event.target as HTMLInputElement).value)) })"
            />
          </div>

          <div class="wb-pop__sec" style="margin-top:1rem">{{ dcEditingId != null ? '编辑事件' : '添加事件' }}</div>
          <div class="wb-row">
            <label>名称</label>
            <input class="wb-input" v-model="dcLabel" placeholder="如：春节 / 妈妈生日" />
          </div>
          <div class="wb-row">
            <label>重复</label>
            <WbSelect :options="dcRepeatOpts" :model-value="dcRepeat" @update:model-value="(v) => (dcRepeat = v as DayCountRepeat)" />
          </div>
          <template v-if="dcRepeat === 'once'">
            <div class="wb-row">
              <label>日期</label>
              <input class="wb-input" type="date" v-model="dcDate" />
            </div>
          </template>
          <template v-else-if="dcRepeat === 'yearly'">
            <div class="wb-row"><label>月份</label><WbSelect :options="dcMonthOpts" :model-value="dcMonth" @update:model-value="(v) => (dcMonth = v as number)" /></div>
            <div class="wb-row"><label>日</label><WbSelect :options="dcDayOpts" :model-value="dcDay" @update:model-value="(v) => (dcDay = v as number)" /></div>
          </template>
          <template v-else-if="dcRepeat === 'monthly'">
            <div class="wb-row"><label>每月几日</label><WbSelect :options="dcDayOpts" :model-value="dcDay" @update:model-value="(v) => (dcDay = v as number)" /></div>
          </template>
          <template v-else-if="dcRepeat === 'weekly'">
            <div class="wb-row"><label>星期</label><WbSelect :options="dcWdayOpts" :model-value="dcWday" @update:model-value="(v) => (dcWday = v as number)" /></div>
          </template>
          <div class="wb-row" style="align-items:center">
            <label>强调色</label>
            <WbSwitch :model-value="dcHasColor" @update:model-value="(v: boolean) => (dcHasColor = v)" />
            <input v-if="dcHasColor" type="color" v-model="dcColor" style="width:38px;height:26px;border:none;background:none;padding:0;margin-left:.4rem" />
          </div>
          <button class="btn btn-sm" @click="saveDc">{{ dcEditingId != null ? '保存修改' : '添加事件' }}</button>
          <button v-if="dcEditingId != null" class="btn btn-sm btn-ghost" @click="resetDc" style="margin-left:.5rem">取消</button>
        </template>

        <!-- 天气 / 资讯（和风天气，需申请 API Key） -->
        <template v-if="instType === 'weather'">
          <div class="wb-pop__sec">城市</div>
          <div class="wb-row">
            <label>城市</label>
            <input class="wb-input" :value="cfg.city" @change="wb.patchInst(props.iid, { city: ($event.target as HTMLInputElement).value.trim() || '上海' })" placeholder="如 上海 / 北京 / 杭州" />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">和风天气 API（需自行申请）</div>
          <div class="wb-row">
            <label>API Key</label>
            <input class="wb-input" type="password" v-model="weatherApiKeyModel" placeholder="在 dev.qweather.com 申请后填写" autocomplete="off" />
          </div>
          <div class="wb-row">
            <label>接入点</label>
            <input class="wb-input" v-model="weatherHostModel" placeholder="可选，默认 api.qweather.com" />
          </div>
          <div class="wb-opt">
            <span class="wb-opt__label">JWT 认证（推荐）</span>
            <WbSwitch v-model="weatherAuthModel" />
          </div>
          <p class="wb-muted" style="font-size:.74rem;margin:.35rem 0 0">
            开启后改用 JWT Bearer 认证（和风推荐，2027 年起 API KEY 方式将限流）。免费 Key 多数同时支持两种方式。
          </p>
          <p class="wb-muted" style="font-size:.74rem;margin:.35rem 0 0">
            接入点填错会报 <b>Invalid Host</b>（403）：标准版用 <code>api.qweather.com</code>；受限免费版必须用 <code>{KEY}.re.qweatherapi.com</code>（KEY 即你的 Key 前缀）。
          </p>
          <p class="wb-muted" style="font-size:.74rem;margin:.35rem 0 0">
            若报错 <b>Security Restriction</b>（403），通常是该 Key 未开通 <b>GeoAPI（地理解析）</b>服务——本应用已内置常用城市对照表，普通城市名可直接解析、无需 GeoAPI；若填了冷门城市仍报此错，可在和风控制台为该 Key 开通 GeoAPI，或直接填 LocationID（如 上海=101020100）。<b>此错误与是否用 JWT 无关。</b>
          </p>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            数据由和风天气（QWeather）提供，需到
            <a href="https://dev.qweather.com" target="_blank" rel="noopener">dev.qweather.com</a>
            免费申请 Key（免费版 1000 次/天）。填写后天气卡片即显示真实预报；留空则显示占位数据。
          </p>

          <div class="wb-pop__sec" style="margin-top: 1rem">自动刷新</div>
          <div class="wb-opt">
            <span class="wb-opt__label">自动刷新</span>
            <WbSwitch v-model="weatherAutoModel" />
          </div>
          <template v-if="weatherAutoModel">
            <div class="wb-row">
              <label>刷新方式</label>
              <WbSelect :options="weatherModeOpts" v-model="weatherModeModel" />
            </div>
            <template v-if="weatherModeModel === 'interval'">
              <div class="wb-row">
                <label>刷新间隔</label>
                <WbSelect :options="weatherIntervalOpts" v-model="weatherIntervalModel" />
              </div>
            </template>
            <template v-else>
              <div class="wb-pop__sec" style="margin-top:.6rem">每日刷新时间点</div>
              <div class="wb-wx__times">
                <div v-for="t in weatherTimes" :key="t" class="wb-wx__time">
                  <span>{{ t }}</span>
                  <button class="wb-cell__btn" @click="removeWeatherTime(t)" aria-label="删除">
                    <AppIcon name="trash-2" :size="14" />
                  </button>
                </div>
                <div v-if="weatherTimes.length === 0" class="wb-cd__empty">未添加时间点</div>
              </div>
              <div class="wb-row" style="margin-top:.6rem">
                <label>添加</label>
                <input class="wb-input" type="time" v-model="newWeatherTime" />
                <button class="btn btn-sm" @click="addWeatherTime">添加</button>
              </div>
              <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">到达每个时间点即自动刷新天气（按设备本地时间）。</p>
            </template>
          </template>
        </template>

        <!-- 待办 -->
        <template v-if="instType === 'todo'">
          <div class="wb-pop__sec">默认设置</div>
          <div class="wb-row">
            <label>默认分类</label>
            <WbSelect
              :options="todoCatOpts"
              :model-value="cfg.defaultCategory"
              @update:model-value="(v) => wb.patchInst(props.iid, { defaultCategory: String(v) })"
            />
          </div>
          <div class="wb-opt">
            <span class="wb-opt__label">显示已完成分组</span>
            <WbSwitch v-model="showDoneModel" />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">分类管理（拖拽排序 · 至少保留 1 个）</div>
          <div class="wb-tsort">
            <div
              v-for="(c, i) in cfg.categories"
              :key="c"
              class="wb-tsort__row"
              :class="{ 'is-dragging': dragCatName === c, 'is-editing': editingCat === c }"
              draggable="true"
              @dragstart="onCatDragStart(c)"
              @dragover="onCatDragOver($event, c)"
              @dragend="onCatDragEnd"
            >
              <span class="wb-tsort__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <template v-if="editingCat === c">
                <input class="wb-input wb-tsort__edit" v-model="editCatName" @keyup.enter="saveEditCat" @keyup.esc="cancelEditCat" />
                <button class="wb-cell__btn" @click="saveEditCat" aria-label="保存"><AppIcon name="check" :size="14" /></button>
                <button class="wb-cell__btn" @click="cancelEditCat" aria-label="取消"><AppIcon name="x" :size="14" /></button>
              </template>
              <template v-else>
                <span class="wb-tsort__name">{{ c }}</span>
                <span class="wb-tsort__idx">{{ i + 1 }}</span>
                <button class="wb-cell__btn" @click="startEditCat(c)" aria-label="重命名"><AppIcon name="pencil" :size="14" /></button>
                <button class="wb-cell__btn wb-cell__btn--danger" :disabled="cfg.categories.length <= 1" @click="delTodoCat(c)" aria-label="删除"><AppIcon name="trash-2" :size="14" /></button>
              </template>
            </div>
          </div>
          <div class="wb-row" style="margin-top:.6rem;align-items:flex-end">
            <input class="wb-input" v-model="newCatName" placeholder="新分类名称" @keyup.enter="addTodoCat" />
            <button class="btn btn-sm" @click="addTodoCat">添加</button>
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">排版</div>
          <div class="wb-gap2">
            <div class="wb-gap2__col">
              <label>行间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="24"
                step="1"
                :value="cfg.lineGap"
                @change="wb.patchInst(props.iid, { lineGap: Math.max(0, Math.min(24, Number(($event.target as HTMLInputElement).value))) })"
              />
            </div>
            <div class="wb-gap2__col">
              <label>字号</label>
              <input
                class="wb-input"
                type="number"
                min="11"
                max="22"
                step="1"
                :value="cfg.fontSize"
                @change="wb.patchInst(props.iid, { fontSize: Math.max(11, Math.min(22, Number(($event.target as HTMLInputElement).value))) })"
              />
            </div>
          </div>
        </template>

        <!-- 记事 -->
        <template v-if="instType === 'note'">
          <div class="wb-pop__sec">排序方式</div>
          <div class="wb-row">
            <label>排序</label>
            <WbSelect
              :options="noteSortOpts"
              :model-value="cfg.sortBy"
              @update:model-value="(v) => wb.patchInst(props.iid, { sortBy: v as 'updatedAt' | 'title' })"
            />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">排版</div>
          <div class="wb-gap2">
            <div class="wb-gap2__col">
              <label>行间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="24"
                step="1"
                :value="cfg.lineGap"
                @change="wb.patchInst(props.iid, { lineGap: Math.max(0, Math.min(24, Number(($event.target as HTMLInputElement).value))) })"
              />
            </div>
            <div class="wb-gap2__col">
              <label>字号</label>
              <input
                class="wb-input"
                type="number"
                min="11"
                max="22"
                step="1"
                :value="cfg.fontSize"
                @change="wb.patchInst(props.iid, { fontSize: Math.max(11, Math.min(22, Number(($event.target as HTMLInputElement).value))) })"
              />
            </div>
          </div>
          <p class="wb-muted" style="font-size:.72rem;margin:.2rem 0 .4rem;opacity:.7">
            各列表项之间的纵向间距与文字大小（px）。
          </p>
          <div class="wb-gap2">
            <div class="wb-gap2__col">
              <label>内容内边距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="64"
                step="1"
                :value="cfg.pad"
                @change="wb.patchInst(props.iid, { pad: Math.max(0, Math.min(64, Number(($event.target as HTMLInputElement).value))) })"
              />
              <p class="wb-muted" style="font-size:.72rem;margin:.3rem 0 0;opacity:.7">
                标题、正文、编辑页的取消/保存区域等各分区内部的留白（px），数值越大各区块内部越宽松。
              </p>
            </div>
            <div class="wb-gap2__col">
              <label>页面内边距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="96"
                step="1"
                :value="cfg.outerPad"
                @change="wb.patchInst(props.iid, { outerPad: Math.max(0, Math.min(96, Number(($event.target as HTMLInputElement).value))) })"
              />
              <p class="wb-muted" style="font-size:.72rem;margin:.3rem 0 0;opacity:.7">
                所有显示内容整体与弹窗边框之间的留白（px）；不改变各子元素的边距，仅在外层整体留白。
              </p>
            </div>
          </div>
          <div class="wb-opt">
            <span class="wb-opt__label">点击遮罩关闭弹窗</span>
            <WbSwitch v-model="noteMaskCloseModel" />
          </div>
        </template>

        <!-- 自选股 -->
        <template v-if="instType === 'watchlist'">
          <div class="wb-pop__sec">持仓管理</div>
          <p
            v-if="editingHoldingId != null"
            class="wb-muted"
            style="font-size:.76rem;margin:.2rem 0 0"
          >正在编辑：{{ (cfg.holdings.find((h) => h.id === editingHoldingId)?.name) || (cfg.holdings.find((h) => h.id === editingHoldingId)?.code) }}</p>
          <div class="wb-wl wb-wl--setting">
            <div
              v-for="h in cfg.holdings"
              :key="h.id"
              class="wb-wl__row"
              :class="{ 'is-dragging': dragId === h.id }"
              draggable="true"
              @dragstart="onDragStart(h.id)"
              @dragover="onDragOver($event, h.id)"
              @dragend="onDragEnd"
            >
              <span class="wb-wl__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <div class="wb-wl__info">
                <div class="wb-wl__name">{{ h.name || h.code }} <span class="wb-wl__code">{{ h.code }}</span></div>
                <div class="wb-wl__sub">
                  <span>买入价 <b>{{ h.buyPrice }}</b></span>
                  <span>股数 <b>{{ h.shares }}</b></span>
                  <span v-if="h.costDate">建仓 {{ h.costDate }}</span>
                  <span v-if="h.current">现价 {{ h.current }}</span>
                </div>
              </div>
              <button class="wb-cell__btn" @click="editHolding(h)" aria-label="编辑" title="编辑">
                <AppIcon name="pencil" :size="14" />
              </button>
              <button class="wb-cell__btn" @click="wb.removeHolding(props.iid, h.id)" aria-label="删除" title="删除">
                <AppIcon name="trash-2" :size="14" />
              </button>
            </div>
            <div v-if="cfg.holdings.length === 0" class="wb-cd__empty">暂无持仓，下方添加</div>
          </div>
          <div class="wb-row" style="margin-top:.8rem">
            <label>代码</label><input class="wb-input" v-model="newHolding.code" placeholder="如 600519 / sh600519" />
          </div>
          <div class="wb-row">
            <label>买入价</label><input class="wb-input" v-model.number="newHolding.buyPrice" type="number" step="0.01" placeholder="持仓成本价" />
          </div>
          <div class="wb-row">
            <label>股数</label><input class="wb-input" v-model.number="newHolding.shares" type="number" step="1" placeholder="持仓数量" />
          </div>
          <div class="wb-row">
            <label>建仓日期</label><input class="wb-input" v-model="newHolding.costDate" type="date" />
          </div>
          <div class="wb-wl__form-actions">
            <button class="btn btn-sm" @click="editingHoldingId != null ? saveEditHolding() : addHolding()">
              {{ editingHoldingId != null ? '保存修改' : '添加持仓' }}
            </button>
            <button v-if="editingHoldingId != null" class="btn btn-sm btn-ghost" @click="cancelEditHolding">取消</button>
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">现价 / 昨收 / 名称由实时行情自动获取</p>

          <div class="wb-pop__sec" style="margin-top: 1rem">行情刷新</div>
          <div class="wb-opt">
            <span class="wb-opt__label">开市时段自动刷新</span>
            <WbSwitch v-model="wlAutoRefreshModel" />
          </div>
          <div class="wb-row" :class="{ 'is-disabled': !wlAutoRefreshModel }">
            <label>刷新间隔</label>
            <WbSelect :options="wlIntervalOpts" v-model="wlIntervalModel" :disabled="!wlAutoRefreshModel" />
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            仅在 A 股开市时段自动刷新（周一至周五 9:30–11:30、13:00–15:00，非法定节假日）；行情写入后卡片实时更新，无需刷新网页。
          </p>
        </template>

        <!-- 实时热搜 -->
        <template v-if="instType === 'hotlist'">
          <div class="wb-pop__sec">布局</div>
          <div class="wb-row">
            <label>展示方式</label>
            <WbSelect :options="hotlistLayoutOpts" v-model="hotlistLayoutModel" />
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            标签切换：点顶部 tab 切换平台；分栏并排：每个平台各占一列，无需切换即可浏览全部。
          </p>

          <div class="wb-pop__sec" style="margin-top: 1rem">数据源</div>
          <div class="wb-row">
            <label>数据源</label>
            <WbSelect :options="hotlistProviderOpts" v-model="hotlistProviderModel" />
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            自动（优先 apizero，串台/失败自动回退 uapis）；也可固定只用某一源。
          </p>
          <div class="wb-pop__sec" style="margin-top: 1rem">uapis 数据源（会员通道）</div>
          <div class="wb-row">
            <label>API Key</label>
            <input
              class="wb-input"
              type="password"
              v-model="uapisKeyModel"
              placeholder="uapis 会员 Key，留空=访客模式"
              autocomplete="off"
            />
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.35rem">
            填了会员 Key 后，所有平台走 uapis 会员通道（额度更高、刷新更频繁）；留空则使用访客额度。Key 申请见
            <a href="https://uapis.cn" target="_blank" rel="noopener">uapis.cn</a>。
          </p>

          <div class="wb-pop__sec" style="margin-top: 1rem">已选平台（拖拽排序，点击 × 移除）</div>
          <div ref="hotlistSelRef" class="wb-plats">
            <div v-for="p in selectedPlatforms" :key="p.value" class="wb-plat">
              <button type="button" class="wb-plat__handle" title="拖拽排序" @click.stop>
                <AppIcon name="grip-vertical" :size="14" />
              </button>
              <img v-if="hotlistLogo(p.value)" :src="hotlistLogo(p.value)" :alt="p.label" class="wb-logo wb-plat__logo" />
              <span class="wb-plat__label">{{ p.label }}</span>
              <button type="button" class="wb-plat__remove" :title="'移除 ' + p.label" @click="toggleHotlistPlatform(p.value)">
                <AppIcon name="x" :size="13" />
              </button>
            </div>
            <p v-if="!selectedPlatforms.length" class="wb-muted" style="font-size:.78rem;margin:0">未选择任何平台</p>
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            拖拽手柄可调整展示顺序（卡片端按此顺序排列）；分栏布局下各平台按序并排展示。
          </p>

          <div class="wb-pop__sec" style="margin-top: .9rem">可选平台（点击添加）</div>
          <div class="wb-chips">
            <button
              v-for="s in availablePlatforms"
              :key="s.value"
              type="button"
              class="wb-chip"
              @click="addHotlistPlatform(s.value)"
            >
              <img v-if="hotlistLogo(s.value)" :src="hotlistLogo(s.value)" :alt="s.label" class="wb-logo wb-chip__logo" />
              <AppIcon name="plus" :size="12" /> {{ s.label }}
            </button>
            <p v-if="!availablePlatforms.length" class="wb-muted" style="font-size:.78rem;margin:0">已全部添加</p>
          </div>

          <div class="wb-pop__sec" style="margin-top: 1rem">展示条数</div>
          <div class="wb-row">
            <label>每平台条数</label>
            <WbSelect :options="hotlistLimitOpts" v-model="hotlistLimitModel" />
          </div>

          <div class="wb-pop__sec" style="margin-top: 1rem">自动刷新</div>
          <div class="wb-opt">
            <span class="wb-opt__label">间隔自动刷新</span>
            <WbSwitch v-model="hotlistAutoModel" />
          </div>
          <div class="wb-row" :class="{ 'is-disabled': !hotlistAutoModel }">
            <label>刷新间隔</label>
            <WbSelect :options="hotlistIntervalOpts" v-model="hotlistIntervalModel" :disabled="!hotlistAutoModel" />
          </div>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            后端每 60 秒缓存一次上游数据，开启后按间隔轮询；关闭则仅手动刷新。
          </p>
        </template>

        <!-- 工具箱 -->
        <template v-if="instType === 'tools'">
          <div class="wb-pop__sec" style="margin-top: 1rem">网格间距（px）</div>
          <div class="wb-gap2">
            <div class="wb-gap2__col">
              <label>行间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="24"
                step="1"
                :value="cfg.rowGap"
                @change="wb.patchInst(props.iid, { rowGap: clampToolGap(Number(($event.target as HTMLInputElement).value)) })"
              />
            </div>
            <div class="wb-gap2__col">
              <label>列间距</label>
              <input
                class="wb-input"
                type="number"
                min="0"
                max="24"
                step="1"
                :value="cfg.colGap"
                @change="wb.patchInst(props.iid, { colGap: clampToolGap(Number(($event.target as HTMLInputElement).value)) })"
              />
            </div>
          </div>

          <div class="wb-pop__sec" style="margin-top: 1rem">小工具排序（拖拽调整）</div>
          <div class="wb-tsort">
            <div
              v-for="(t, i) in toolList"
              :key="t.id"
              class="wb-tsort__row"
              :class="{ 'is-dragging': dragToolId === t.id }"
              draggable="true"
              @dragstart="onToolDragStart(t.id)"
              @dragover="onToolDragOver($event, t.id)"
              @dragend="onToolDragEnd"
            >
              <span class="wb-tsort__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <AppIcon :name="t.icon" :size="15" />
              <span class="wb-tsort__name">{{ t.name }}</span>
              <span class="wb-tsort__idx">{{ i + 1 }}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" style="margin-top:.6rem" @click="resetToolOrder">恢复默认顺序</button>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.5rem">
            共 {{ toolList.length }} 个小工具（计算器 / 金额大小写 / 年龄计算 / 番茄钟 / 单位换算 / 长度换算 / 重量换算 / Base64 / 日期推算 / 时间戳转换 / 农历转换）。卡片内点击图标即可打开。
          </p>
        </template>

        <!-- 招标信息 -->
        <template v-if="instType === 'bidding'">
          <div class="wb-pop__sec">自动抓取</div>
          <div class="wb-opt">
            <span class="wb-opt__label">自动抓取</span>
            <WbSwitch v-model="autoFetchModel" />
          </div>
          <div class="wb-row" :class="{ 'is-disabled': !autoFetchModel }">
            <label>抓取间隔</label>
            <WbSelect :options="fetchIntervalOpts" v-model="fetchIntervalModel" :disabled="!autoFetchModel" />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">抓取源</div>
          <div class="wb-src">
            <div v-for="s in cfg.sources" :key="s.id" class="wb-src__item">
              <template v-if="editSrcId === s.id">
                <div class="wb-src__edit">
                  <input class="wb-input" v-model="editSrcName" placeholder="名称（自定义源名称，如「中烟电子采购平台」）" />
                  <div class="wb-row" style="margin:.2rem 0">
                    <label>源类型</label>
                    <WbSelect
                      :options="srcTypeOpts"
                      :model-value="editSrcType"
                      @update:model-value="(v) => (editSrcType = v as 'html' | 'api' | 'rss' | 'browser')"
                    />
                  </div>
                  <template v-if="editSrcType === 'html'">
                    <input class="wb-input" v-model="editSrcUrl" placeholder="抓取网址 URL（首页/栏目页）" />
                    <input class="wb-input" v-model="editSrcKw" placeholder="关键词（逗号分隔）" />
                    <input class="wb-input" v-model="editSrcSearch" placeholder="搜索页 URL 模板（可选，含 {kw}）" />
                    <div class="wb-src__hint">首页不含关键词时填此模板按每个关键词搜索。例：https://site.com/search?q={kw}</div>
                  </template>
                  <template v-else-if="editSrcType === 'api'">
                    <input class="wb-input" v-model="editSrcApiUrl" placeholder="JSON 接口地址（含 {kw} 占位符则按词搜索）" />
                    <input class="wb-input" v-model="editSrcItemPath" placeholder="列表路径（如 data.list，留空=根即列表）" />
                    <input class="wb-input" v-model="editSrcKw" placeholder="关键词（逗号分隔；留空=不过滤）" />
                    <div class="wb-src__hint">字段映射（填 JSON 中的字段名，支持点路径如 proj.title）：</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.4rem">
                      <input class="wb-input" v-model="editF.title" placeholder="标题字段 *" />
                      <input class="wb-input" v-model="editF.url" placeholder="链接字段 *" />
                      <input class="wb-input" v-model="editF.date" placeholder="日期字段" />
                      <input class="wb-input" v-model="editF.summary" placeholder="摘要字段" />
                      <input class="wb-input" v-model="editF.body" placeholder="正文字段" />
                    </div>
                    <div class="wb-src__hint">接口鉴权（申请的 Key/Token，留空=不携带；仅 type=api 生效）：</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.4rem">
                      <input class="wb-input" v-model="editSrcApiKey" type="password" placeholder="API Key / 令牌" autocomplete="off" />
                      <input class="wb-input" v-model="editSrcApiHeader" placeholder="请求头名（默认 Authorization）" />
                    </div>
                  </template>
                  <template v-else-if="editSrcType === 'rss'">
                    <input class="wb-input" v-model="editSrcUrl" placeholder="RSS/Atom 订阅地址（.xml / .rss / feed）" />
                    <input class="wb-input" v-model="editSrcKw" placeholder="关键词（逗号分隔；留空=不过滤）" />
                    <div class="wb-src__hint">订阅源是明文 XML，后端直接解析、不受反爬影响；命中按关键词过滤，点标题去源站看详情。例：https://site.com/rss.xml</div>
                  </template>
                  <template v-else>
                    <input class="wb-input" v-model="editSrcUrl" placeholder="加载并过 WAF 的页面地址（如 https://ctbpsp.com/）" />
                    <input class="wb-input" v-model="editSrcKw" placeholder="关键词（逗号分隔；留空=展示最新公告）" />
                    <input class="wb-input" v-model="editItemSel" placeholder="列表项容器选择器（如 div.left_body）" />
                    <input class="wb-input" v-model="editTitleSel" placeholder="标题选择器（如 p.left_body_name）" />
                    <input class="wb-input" v-model="editSumSel" placeholder="摘要选择器（可空，如 span.btncas）" />
                    <input class="wb-input" v-model="editDateRegex" placeholder="日期正则（如 接收时间[:：]\s*(\d{4}-\d{2}-\d{2})）" />
                    <input class="wb-input" v-model="editBaseUrl" placeholder="站点基址（链接兜底，如 https://ctbpsp.com/）" />
                    <input class="wb-input" v-model="editSearchInputSel" placeholder="搜索框选择器（可选，如 input[type=&quot;text&quot;]）" />
                    <input class="wb-input" v-model="editSearchBtnSel" placeholder="搜索按钮选择器（可选，如 button.btns；留空回车/按「搜索」）" />
                    <input class="wb-input" v-model="editSearchToggleSel" placeholder="全文开关选择器（可选，如 .el-switch.switchStyle；填了后驱动开关 OFF 化切到全文模式）" />
                    <div class="wb-src__hint">无头 Edge 渲染 SPA、等解密后按选择器抽 DOM；适合 WAF + 加密接口 + 无 RSS 的强反爬站点（如 ctbpsp.com）。<b>填了「搜索框选择器」并设关键词后，会按每个关键词驱动站点搜索框抓取命中结果</b>（而非只抓通用首页）；链接无 &lt;a href&gt; 时统一兜底到站点基址，点标题去源站看详情。<b>若站点搜索框旁有「搜标题/搜全文」滑动开关</b>（Element UI 或类似），填入对应 CSS 选择器，浏览器脚本会在搜索开始前把它 OFF 化一次，确保关键词能搜全文而非只匹配标题。</div>
                  </template>
                  <div class="wb-src__edit-btns">
                    <button class="btn btn-sm" @click="saveEditSrc">保存</button>
                    <button class="btn btn-sm btn-ghost" @click="cancelEditSrc">取消</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="wb-src__name">{{ s.name || s.url }}</div>
                <div v-if="s.name" class="wb-src__url wb-src__url--sub">{{ s.url }}</div>
                <div v-if="s.type === 'api'" class="wb-src__url wb-src__url--sub">JSON · {{ s.apiUrl }}</div>
                <div v-else-if="s.type === 'rss'" class="wb-src__url wb-src__url--sub">RSS 订阅源（明文 XML，不受反爬影响）</div>
                <div v-else-if="s.type === 'browser'" class="wb-src__url wb-src__url--sub">浏览器渲染 · 反爬 SPA（无头 Edge 抽 DOM）· {{ s.baseUrl }}</div>
                <div v-else-if="s.searchUrl" class="wb-src__url wb-src__url--sub">搜索模板：{{ s.searchUrl }}</div>
                <div class="wb-src__kw">
                  <span v-if="s.type === 'api'" class="wb-tag wb-tag--api">JSON</span>
                  <span v-else-if="s.type === 'rss'" class="wb-tag wb-tag--api">RSS</span>
                  <span v-else-if="s.type === 'browser'" class="wb-tag wb-tag--api">浏览器</span>
                  <span v-for="k in s.keywords" :key="k" class="wb-tag">{{ k }}</span>
                  <button class="wb-tag wb-tag--edit" @click="startEditSrc(s)">编辑</button>
                  <button class="wb-tag wb-tag--open" @click="openSrc(s)" title="在浏览器中打开该源站（部分站点有反爬，需手动查看）">打开</button>
                  <button class="wb-tag wb-tag--del" @click="wb.removeBiddingSource(props.iid, s.id)">删除</button>
                </div>
                <div class="wb-opt">
                  <span class="wb-opt__label">抓取详情页正文</span>
                  <WbSwitch :model-value="s.fetchBody !== false" @update:model-value="setSrcBody(s, $event)" />
                </div>
              </template>
            </div>
            <div v-if="cfg.sources.length === 0" class="wb-cd__empty">暂无抓取源</div>
          </div>
          <div class="wb-src__add">
            <input class="wb-input" v-model="newSrcName" placeholder="名称（自定义源名称）" />
            <div class="wb-row" style="margin:.2rem 0">
              <label>源类型</label>
              <WbSelect
                :options="srcTypeOpts"
                :model-value="newSrcType"
                @update:model-value="(v) => (newSrcType = v as 'html' | 'api' | 'rss' | 'browser')"
              />
            </div>
            <template v-if="newSrcType === 'html'">
              <input class="wb-input" v-model="newSrcUrl" placeholder="抓取网址 URL（首页/栏目页）" />
              <input class="wb-input" v-model="newSrcKw" placeholder="关键词（逗号分隔）" />
              <input class="wb-input" v-model="newSrcSearch" placeholder="搜索页 URL 模板（可选，含 {kw}）" />
            </template>
            <template v-else-if="newSrcType === 'api'">
              <input class="wb-input" v-model="newSrcApiUrl" placeholder="JSON 接口地址（含 {kw} 占位符）" />
              <input class="wb-input" v-model="newSrcItemPath" placeholder="列表路径（如 data.list，留空=根即列表）" />
              <input class="wb-input" v-model="newSrcKw" placeholder="关键词（逗号分隔；留空=不过滤）" />
              <div class="wb-src__hint">字段映射（填 JSON 中的字段名）：</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.4rem">
                <input class="wb-input" v-model="newF.title" placeholder="标题字段 *" />
                <input class="wb-input" v-model="newF.url" placeholder="链接字段 *" />
                <input class="wb-input" v-model="newF.date" placeholder="日期字段" />
                <input class="wb-input" v-model="newF.summary" placeholder="摘要字段" />
                <input class="wb-input" v-model="newF.body" placeholder="正文字段" />
              </div>
              <div class="wb-src__hint">接口鉴权（申请的 Key/Token，留空=不携带；仅 type=api 生效）：</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.4rem">
                <input class="wb-input" v-model="newSrcApiKey" type="password" placeholder="API Key / 令牌" autocomplete="off" />
                <input class="wb-input" v-model="newSrcApiHeader" placeholder="请求头名（默认 Authorization）" />
              </div>
            </template>
            <template v-else-if="newSrcType === 'rss'">
              <input class="wb-input" v-model="newSrcUrl" placeholder="RSS/Atom 订阅地址（.xml / .rss / feed）" />
              <input class="wb-input" v-model="newSrcKw" placeholder="关键词（逗号分隔；留空=不过滤）" />
              <div class="wb-src__hint">订阅源是明文 XML，后端直接解析、不受反爬影响；命中按关键词过滤，点标题去源站看详情。例：https://site.com/rss.xml</div>
            </template>
            <template v-else>
              <input class="wb-input" v-model="newSrcUrl" placeholder="加载并过 WAF 的页面地址（如 https://ctbpsp.com/）" />
              <input class="wb-input" v-model="newSrcKw" placeholder="关键词（逗号分隔；留空=展示最新公告）" />
              <input class="wb-input" v-model="newItemSel" placeholder="列表项容器选择器（如 div.left_body）" />
              <input class="wb-input" v-model="newTitleSel" placeholder="标题选择器（如 p.left_body_name）" />
              <input class="wb-input" v-model="newSumSel" placeholder="摘要选择器（可空，如 span.btncas）" />
              <input class="wb-input" v-model="newDateRegex" placeholder="日期正则（如 接收时间[:：]\s*(\d{4}-\d{2}-\d{2})）" />
              <input class="wb-input" v-model="newBaseUrl" placeholder="站点基址（链接兜底，如 https://ctbpsp.com/）" />
              <input class="wb-input" v-model="newSearchInputSel" placeholder="搜索框选择器（可选，如 input[type=&quot;text&quot;]）" />
              <input class="wb-input" v-model="newSearchBtnSel" placeholder="搜索按钮选择器（可选，如 button.btns；留空回车/按「搜索」）" />
              <input class="wb-input" v-model="newSearchToggleSel" placeholder="全文开关选择器（可选，如 .el-switch.switchStyle；填了后驱动开关 OFF 化切到全文模式）" />
              <button class="btn btn-sm btn-ghost" type="button" @click="fillCtbpspPreset">填入 ctbpsp 预设</button>
              <div class="wb-src__hint">无头 Edge 渲染 SPA、等解密后按选择器抽 DOM；适合 WAF + 加密接口 + 无 RSS 的强反爬站点（如 ctbpsp.com）。<b>填了「搜索框选择器」并设关键词后，会按每个关键词驱动站点搜索框抓取命中结果</b>（而非只抓通用首页）；链接无 &lt;a href&gt; 时统一兜底到站点基址。<b>若站点搜索框旁有「搜标题/搜全文」滑动开关</b>，填入对应 CSS 选择器，浏览器脚本会在搜索开始前把它 OFF 化一次。</div>
            </template>
            <button class="btn btn-sm" @click="addSrc">添加源</button>
          </div>
        </template>

        <!-- 常用链接 -->
        <template v-if="instType === 'links'">
          <div class="wb-pop__sec">链接管理</div>
          <p
            v-if="editingLinkId != null"
            class="wb-muted"
            style="font-size:.76rem;margin:.2rem 0 0"
          >正在编辑：{{ (cfg.items.find((l) => l.id === editingLinkId)?.title) || (cfg.items.find((l) => l.id === editingLinkId)?.url) }}</p>
          <div class="wb-lk">
            <div
              v-for="l in cfg.items"
              :key="l.id"
              class="wb-lk__row"
              :class="{ 'is-dragging': dragLinkId === l.id }"
              draggable="true"
              @dragstart="onLinkDragStart(l.id)"
              @dragover="onLinkDragOver($event, l.id)"
              @dragend="onLinkDragEnd"
            >
              <span class="wb-lk__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <span class="wb-lk__ic">
                <img v-if="l.iconImg" :src="l.iconImg" class="wb-lk__img" alt="" />
                <AppIcon v-else :name="l.icon" :size="16" />
              </span>
              <span class="wb-lk__title">{{ l.title || l.url }}</span>
              <span class="wb-lk__url">{{ l.url }}</span>
              <button class="wb-cell__btn" @click="editLink(l)" aria-label="编辑" title="编辑">
                <AppIcon name="pencil" :size="14" />
              </button>
              <button class="wb-cell__btn" @click="wb.removeLink(props.iid, l.id)" aria-label="删除" title="删除">
                <AppIcon name="trash-2" :size="14" />
              </button>
            </div>
            <div v-if="cfg.items.length === 0" class="wb-cd__empty">暂无链接</div>
          </div>
          <div class="wb-lk__add">
            <input class="wb-input" v-model="newLinkTitle" placeholder="名称（如 GitHub）" />
            <input class="wb-input" v-model="newLinkUrl" placeholder="网址 URL" />
            <input class="wb-input" v-model="newLinkIcon" placeholder="图标名（Lucide，留空=link）" />
            <input class="wb-input" v-model="newLinkIconUrl" placeholder="图标链接（图片 URL，可选）" />
            <label class="wb-file">
              <AppIcon name="upload" :size="14" />
              <span>{{ newLinkIconData ? '已选图片（点击替换）' : '上传图标（jpg/png/svg）' }}</span>
              <input class="wb-file__input" type="file" accept="image/*,.svg" @change="onLinkIconFile" />
            </label>
            <img v-if="newLinkIconData" :src="newLinkIconData" class="wb-file__preview" alt="图标预览" />
            <div class="wb-lk__add-btns">
              <button class="btn btn-sm" @click="editingLinkId != null ? saveEditLink() : addLk()">
                {{ editingLinkId != null ? '保存修改' : '添加链接' }}
              </button>
              <button v-if="editingLinkId != null" class="btn btn-sm btn-ghost" @click="cancelEditLink">取消</button>
            </div>
          </div>
        </template>

        <!-- 世界时间 -->
        <template v-if="instType === 'worldclock'">
          <div class="wb-pop__sec">已显示城市（拖拽排序，点击 × 移除）</div>
          <div class="wb-cits">
            <div
              v-for="(c, i) in worldCities"
              :key="c.name"
              class="wb-cit"
              :class="{ 'is-dragging': wcDragIdx === i }"
              draggable="true"
              @dragstart="onWcDragStart(i)"
              @dragover="onWcDragOver($event, i)"
              @dragend="onWcDragEnd"
            >
              <span class="wb-cit__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <img v-if="!wcFlagFailed[c.timeZone] && cityFlagUrl(c)" class="wb-cit__flag" :src="cityFlagUrl(c)" :alt="cityIso(c)" @error="onWcFlagErr(c)" />
              <span v-else-if="cityIso(c)" class="wb-cit__flagtxt">{{ cityIso(c) }}</span>
              <span class="wb-cit__name">{{ c.name }}</span>
              <span class="wb-cit__tz">{{ c.timeZone }}</span>
              <button class="wb-cell__btn" @click="removeCity(c.name)" aria-label="删除" title="删除">
                <AppIcon name="trash-2" :size="14" />
              </button>
            </div>
            <p v-if="!worldCities.length" class="wb-cd__empty">未添加城市</p>
          </div>

          <div class="wb-pop__sec" style="margin-top: 1rem">添加预设城市</div>
          <div class="wb-chips">
            <button
              v-for="p in availablePresets"
              :key="p.name"
              type="button"
              class="wb-chip"
              @click="addPresetCity(p)"
            >
              <img v-if="!wcFlagFailed[p.timeZone] && cityFlagUrl(p)" class="wb-chip__flag" :src="cityFlagUrl(p)" :alt="cityIso(p)" @error="onWcFlagErr(p)" />
              <span v-else-if="cityIso(p)" class="wb-chip__flagtxt">{{ cityIso(p) }}</span>
              <AppIcon name="plus" :size="12" /> {{ p.name }}
            </button>
            <p v-if="!availablePresets.length" class="wb-muted" style="font-size:.78rem;margin:0">已全部添加</p>
          </div>

          <div class="wb-pop__sec" style="margin-top: 1rem">自定义城市</div>
          <div class="wb-row">
            <label>名称</label><input class="wb-input" v-model="newCityName" placeholder="如 旧金山" />
          </div>
          <div class="wb-row">
            <label>国家</label><input class="wb-input" v-model="newCityCountry" placeholder="如 美国、印尼（用于国旗，可留空）" />
          </div>
          <div class="wb-row">
            <label>时区</label><input class="wb-input" v-model="newCityTz" placeholder="IANA 时区，如 America/Los_Angeles" />
          </div>
          <p v-if="tzError" class="wb-muted" style="color:#e57373;font-size:.76rem;margin:.3rem 0 0">{{ tzError }}</p>
          <button class="btn btn-sm" style="margin-top:.5rem" @click="addCustomCity">添加城市</button>
          <p class="wb-muted" style="font-size:.76rem;margin-top:.4rem">
            时区填写 IANA 标准标识（如 Asia/Shanghai、Europe/London）。时间由浏览器本地计算，无需联网。
          </p>

          <div class="wb-pop__sec" style="margin-top: 1rem">城市行间距（px）</div>
          <div class="wb-row">
            <label>行间距</label>
            <input
              class="wb-input"
              type="number"
              min="0"
              max="32"
              step="1"
              :value="wcLineGap"
              @change="wb.patchInst(props.iid, { lineGap: clampGap(Number(($event.target as HTMLInputElement).value)) })"
            />
          </div>
        </template>


      </div>

      <footer class="wb-pop__foot">
        <button class="btn btn-sm btn-ghost" @click="emit('close')">完成</button>
      </footer>
    </div>
  </div>
</template>
