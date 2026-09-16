<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import WbSelect from '../WbSelect.vue'
import WbDatePicker from './WbDatePicker.vue'
import TranslateTool from './TranslateTool.vue'
import { caseAmount } from '@/utils/caseAmount'
import { ageCalc } from '@/utils/ageCalc'
import { solarToLunar } from '@/utils/lunar'
import { useWorkbenchStore, TOOL_META, type ToolId } from '@/stores/workbench'
import { usePomodoro } from '@/composables/usePomodoro'
import { useDashboardStore } from '@/stores/dashboard'
import Sortable from 'sortablejs'
import {
  LENGTH_UNITS,
  WEIGHT_UNITS,
  UNIT_CATEGORIES,
  convertByFactor,
  convertTemp,
  fmtNum,
  b64Encode,
  b64Decode,
  toDateStr,
  toDateTimeStr,
  weekCn,
  parseDateStr,
  shiftDate,
  diffDays,
  type UnitDef,
} from '@/utils/convert'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const dash = useDashboardStore()
const active = ref<ToolId | null>(null)
// 翻译弹窗尺寸（视口百分比）：来自设置，覆盖 CSS 默认最小宽高
const transPopStyle = computed<Record<string, string>>(() => {
  const s = cfg.value.translate.size || { vw: 40, vh: 60 }
  return { minWidth: s.vw + 'vw', minHeight: s.vh + 'vh' }
})

// 小工具顺序由 cfg.value.order 决定；名称/图标取自 store 的 TOOL_META（与设置页共用）
const tools = computed(() =>
  cfg.value.order.map((id) => ({ id, ...TOOL_META[id] })).filter((t) => !!t.name),
)
const gridStyle = computed(() => ({
  rowGap: `${cfg.value.rowGap}px`,
  columnGap: `${cfg.value.colGap}px`,
}))

// —— 通用复制（多个工具共用「点击复制 + 已复制」反馈）——
const copied = ref(false)
async function copyText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* 忽略 */ }
    document.body.removeChild(ta)
  }
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1200)
}

// —— 计算器 ——
const expr = ref('')
const result = computed<string>(() => {
  const e = expr.value.trim()
  if (!e) return ''
  if (!/^[0-9+\-*/().\s]+$/.test(e)) return '非法'
  try {
    const r = Function(`"use strict";return (${e})`)() as number
    if (typeof r !== 'number' || !isFinite(r)) return '错误'
    return String(r)
  } catch {
    return '错误'
  }
})
// 计算器按键：右侧运算列从上到下为 + - × ÷
const calcKeys: { label: string; val: string; op?: boolean; cls?: string }[] = [
  { label: '7', val: '7' }, { label: '8', val: '8' }, { label: '9', val: '9' }, { label: '+', val: '+', op: true },
  { label: '4', val: '4' }, { label: '5', val: '5' }, { label: '6', val: '6' }, { label: '-', val: '-', op: true },
  { label: '1', val: '1' }, { label: '2', val: '2' }, { label: '3', val: '3' }, { label: '×', val: '*', op: true },
  { label: '0', val: '0' }, { label: '.', val: '.' }, { label: '=', val: '=', cls: 'wb-calc__eq' }, { label: '÷', val: '/', op: true },
]
// 表达式显示用 × ÷ 代替 * /（求值仍用原始字符）
const displayExpr = computed(() => {
  const d = expr.value.replace(/\*/g, '×').replace(/\//g, '÷')
  return d || '0'
})
function press(k: string) {
  if (k === '=') {
    const r = result.value
    if (r && r !== '非法' && r !== '错误') expr.value = r
    return
  }
  expr.value += k
}
function calcClear() {
  expr.value = ''
}

// —— 金额大小写 ——
const amount = ref('')
const amountOut = computed(() => (amount.value.trim() ? caseAmount(amount.value) : ''))

// —— 年龄（快速填写 + 日历选择，双向同步）——
const birth = ref('')
const ageQuick = ref('')
const ageOut = computed(() => (birth.value ? ageCalc(birth.value) : null))
const pad2 = (n: number) => (n < 10 ? '0' + n : String(n))
/** 解析灵活分隔符的出生日期输入：YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYY年MM月DD日 */
function applyAgeQuick() {
  const s = (ageQuick.value || '').trim()
  if (!s) return
  const m = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const dt = parseDateStr(`${y}-${pad2(mo)}-${pad2(d)}`)
    if (dt) {
      birth.value = `${y}-${pad2(mo)}-${pad2(d)}`
      ageQuick.value = birth.value
      return
    }
  }
  const p = parseDateStr(s)
  if (p) {
    const str = toDateStr(p)
    birth.value = str
    ageQuick.value = str
  }
}
// 日历选择改动时同步回快速输入框
watch(birth, (v) => {
  ageQuick.value = v
})

// —— 番茄钟（状态迁入 usePomodoro：关闭弹窗 / 刷新后继续计时）——
const pomo = usePomodoro()

// ============ 换算类小工具：共用「倍数换算」逻辑 ============
/**
 * 生成一组「数值 + 源单位 + 目标单位 → 结果 + 全单位一览」的响应式状态。
 * 返回 reactive 对象（而非裸 ref 集合），模板里可直接 `len.val` / `v-model="len.val"`，
 * 无需写 `.value`，也不会因解构而丢失响应性。
 */
function useFactorConv(units: UnitDef[], fromKey: string, toKey: string) {
  const val = ref('1')
  const from = ref(fromKey)
  const to = ref(toKey)
  const opts = units.map((u) => ({ label: u.name, value: u.key }))
  const num = computed(() => {
    const s = val.value.trim()
    if (!s) return NaN
    const n = Number(s)
    return Number.isFinite(n) ? n : NaN
  })
  const out = computed(() => {
    const f = units.find((u) => u.key === from.value)
    const t = units.find((u) => u.key === to.value)
    if (!f || !t || Number.isNaN(num.value)) return ''
    return fmtNum(convertByFactor(num.value, f, t))
  })
  const all = computed(() => {
    const f = units.find((u) => u.key === from.value)
    if (!f || Number.isNaN(num.value)) return []
    return units.map((u) => ({
      key: u.key,
      name: u.name,
      text: fmtNum(convertByFactor(num.value, f, u)),
    }))
  })
  const toName = computed(() => units.find((u) => u.key === to.value)?.name || '')
  function swap() {
    const a = from.value
    from.value = to.value
    to.value = a
  }
  return reactive({ val, from, to, opts, out, all, toName, swap })
}

// —— 长度换算（基准 米；默认 米 → 英尺）——
const len = useFactorConv(LENGTH_UNITS, 'm', 'ft')
// —— 重量换算（基准 千克；默认 千克 → 市斤）——
const wt = useFactorConv(WEIGHT_UNITS, 'kg', 'jin')

// —— 单位换算（多分类：温度 / 面积 / 体积 / 存储 / 速度 / 时间）——
const uCatKey = ref('temp')
const catOpts = UNIT_CATEGORIES.map((c) => ({ label: c.name, value: c.key }))
const uCat = computed(() => UNIT_CATEGORIES.find((c) => c.key === uCatKey.value) || UNIT_CATEGORIES[0])
const uFrom = ref('C')
const uTo = ref('F')
const uVal = ref('1')
const uOpts = computed(() => uCat.value.units.map((u) => ({ label: u.name, value: u.key })))
// 切换分类时重置源/目标单位，避免残留上一分类的 key 导致结果为空
watch(uCatKey, () => {
  const us = uCat.value.units
  uFrom.value = us[0].key
  uTo.value = (us[1] || us[0]).key
})
const uNum = computed(() => {
  const s = uVal.value.trim()
  if (!s) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
})
function uConvert(toKey: string): string {
  if (Number.isNaN(uNum.value)) return ''
  if (uCat.value.key === 'temp') return fmtNum(convertTemp(uNum.value, uFrom.value, toKey))
  const f = uCat.value.units.find((u) => u.key === uFrom.value)
  const t = uCat.value.units.find((u) => u.key === toKey)
  if (!f || !t) return ''
  return fmtNum(convertByFactor(uNum.value, f, t))
}
const uOut = computed(() => uConvert(uTo.value))
const uAll = computed(() =>
  Number.isNaN(uNum.value)
    ? []
    : uCat.value.units.map((u) => ({ key: u.key, name: u.name, text: uConvert(u.key) })),
)
const uToName = computed(() => uCat.value.units.find((u) => u.key === uTo.value)?.name || '')
function uSwap() {
  const a = uFrom.value
  uFrom.value = uTo.value
  uTo.value = a
}

// —— Base64 编解码（UTF-8 安全）——
const b64Mode = ref<'enc' | 'dec'>('enc')
const b64In = ref('')
const b64Out = computed(() => {
  const s = b64In.value
  if (!s.trim()) return ''
  try {
    return b64Mode.value === 'enc' ? b64Encode(s) : b64Decode(s)
  } catch {
    return b64Mode.value === 'dec' ? '⚠ 不是合法的 Base64 字符串' : '⚠ 编码失败'
  }
})
const b64Bad = computed(() => b64Out.value.startsWith('⚠'))

// —— 日期推算 ——
const todayStr = toDateStr(new Date())
const dcBase = ref(todayStr)
const dcN = ref(30)
const dcUnit = ref<'day' | 'week' | 'month' | 'year'>('day')
const dcDir = ref<1 | -1>(1)
const dcUnitOpts = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
]
const dcOut = computed(() => {
  const b = parseDateStr(dcBase.value)
  const n = Number(dcN.value)
  if (!b || !Number.isFinite(n)) return null
  const r = shiftDate(b, Math.round(n) * dcDir.value, dcUnit.value)
  const l = solarToLunar(r.getFullYear(), r.getMonth() + 1, r.getDate())
  return {
    date: toDateStr(r),
    week: weekCn(r),
    lunar: `${l.monthText}${l.dayText}`,
    days: diffDays(b, r),
  }
})
const dcA = ref(todayStr)
const dcB = ref(toDateStr(shiftDate(new Date(), 100, 'day')))
const dcDiff = computed(() => {
  const a = parseDateStr(dcA.value)
  const b = parseDateStr(dcB.value)
  if (!a || !b) return null
  const d = diffDays(a, b)
  const abs = Math.abs(d)
  return {
    days: d,
    weeks: fmtNum(abs / 7),
    months: fmtNum(abs / 30.4375),
    years: fmtNum(abs / 365.2425),
  }
})

// —— 时间戳转换 ——
function toLocalInput(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const nowMs = ref(Date.now())
let nowTimer: number | undefined
const tsIn = ref(String(Math.floor(Date.now() / 1000)))
const TS_BAD = { bad: true, local: '', week: '', iso: '', unit: '' }
const tsOut = computed(() => {
  const s = tsIn.value.trim()
  if (!s) return null
  if (!/^\d{1,16}$/.test(s)) return TS_BAD
  const n = Number(s)
  // 10 位（及以下）按秒、13 位按毫秒、更长按微秒
  const ms = s.length <= 10 ? n * 1000 : s.length <= 13 ? n : Math.floor(n / 1000)
  const d = new Date(ms)
  if (isNaN(d.getTime())) return TS_BAD
  return {
    bad: false,
    local: toDateTimeStr(d),
    week: weekCn(d),
    iso: d.toISOString(),
    unit: s.length <= 10 ? '按「秒」解析' : s.length <= 13 ? '按「毫秒」解析' : '按「微秒」解析',
  }
})
const dtIn = ref(toLocalInput(new Date()))
const dtOut = computed(() => {
  const d = new Date(dtIn.value)
  if (isNaN(d.getTime())) return null
  return { sec: Math.floor(d.getTime() / 1000), ms: d.getTime() }
})
function useNowTs() {
  tsIn.value = String(Math.floor(Date.now() / 1000))
}
function useNowDt() {
  dtIn.value = toLocalInput(new Date())
}

// —— 农历转换 ——
const lunarIn = ref(todayStr)
const lunarOut = computed(() => {
  const d = parseDateStr(lunarIn.value)
  if (!d) return null
  const l = solarToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return { l, week: weekCn(d) }
})

// —— 汇率换算（实时抓取 open.er-api.com，失败用离线估算兜底；纯前端、零密钥）——
/** 常用货币：代码 + 中文名 + 符号（与离线兜底一一对应） */
const EX_ALL: { code: string; name: string; symbol: string }[] = [
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'CNY', name: '人民币', symbol: '¥' },
  { code: 'EUR', name: '欧元', symbol: '€' },
  { code: 'JPY', name: '日元', symbol: '¥' },
  { code: 'GBP', name: '英镑', symbol: '£' },
  { code: 'HKD', name: '港币', symbol: 'HK$' },
  { code: 'KRW', name: '韩元', symbol: '₩' },
  { code: 'TWD', name: '新台币', symbol: 'NT$' },
  { code: 'AUD', name: '澳元', symbol: 'A$' },
  { code: 'CAD', name: '加元', symbol: 'C$' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'Fr' },
  { code: 'SGD', name: '新加坡元', symbol: 'S$' },
  { code: 'THB', name: '泰铢', symbol: '฿' },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM' },
  { code: 'RUB', name: '俄罗斯卢布', symbol: '₽' },
  { code: 'INR', name: '印度卢比', symbol: '₹' },
  { code: 'BRL', name: '巴西雷亚尔', symbol: 'R$' },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$' },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱' },
  { code: 'MOP', name: '澳门元', symbol: 'MOP$' },
  { code: 'VND', name: '越南盾', symbol: '₫' },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp' },
]
/** 离线兜底汇率（基准 USD=1，约值）。联网成功会被实时数据覆盖。 */
const EX_FALLBACK: Record<string, number> = {
  USD: 1, CNY: 7.2, EUR: 0.92, JPY: 150, GBP: 0.79,
  HKD: 7.8, KRW: 1350, TWD: 32, AUD: 1.52, CAD: 1.36,
  CHF: 0.88, SGD: 1.34, THB: 35, MYR: 4.7, RUB: 92,
  INR: 83, BRL: 5.0, NZD: 1.64, PHP: 56, MOP: 8.05,
  VND: 24500, IDR: 15500,
}
// 当前币种列表：以 store 持久化的用户列表为准（可增删 / 拖拽排序）
const exCurrencies = computed(() => cfg.value.exchangeCurrencies)
function updateCurrencies(list: { code: string; name: string; symbol: string }[]) {
  cfg.value.exchangeCurrencies = list
}
// 候选可快速添加币种（尚未在当前列表里的）
const exSuggest = computed(() => {
  const have = new Set(exCurrencies.value.map((c) => c.code))
  return EX_ALL.filter((c) => !have.has(c.code))
})
const exOpts = computed(() => exCurrencies.value.map((c) => ({ label: `${c.name} ${c.code}`, value: c.code })))
const exAmount = ref('100')
const exFrom = ref('USD')
const exTo = ref('CNY')
// 管理货币模式（增删 + 拖拽排序）
const exManage = ref(false)
const exListEl = ref<HTMLElement | null>(null)
let exSortable: Sortable | null = null
function normalizeEx() {
  const codes = exCurrencies.value.map((c) => c.code)
  if (!codes.includes(exFrom.value)) exFrom.value = codes[0] || 'USD'
  if (!codes.includes(exTo.value)) exTo.value = codes.find((c) => c.code !== exFrom.value) || codes[0] || 'CNY'
}
const addCode = ref('')
const addName = ref('')
const addSymbol = ref('')
const exAddErr = ref('')
function exAdd() {
  const code = addCode.value.trim().toUpperCase()
  const name = addName.value.trim()
  const symbol = addSymbol.value.trim()
  if (!code || !name) {
    exAddErr.value = '请填写币种代码与名称'
    return
  }
  if (!/^[A-Z]{3}$/.test(code)) {
    exAddErr.value = '代码须为 3 位大写字母（如 USD）'
    return
  }
  if (exCurrencies.value.some((c) => c.code === code)) {
    exAddErr.value = `已存在币种 ${code}`
    return
  }
  exAddErr.value = ''
  updateCurrencies([...exCurrencies.value, { code, name, symbol: symbol || code }])
  addCode.value = ''
  addName.value = ''
  addSymbol.value = ''
}
function exAddSuggest(code: string) {
  const c = EX_ALL.find((x) => x.code === code)
  if (!c || exCurrencies.value.some((x) => x.code === code)) return
  updateCurrencies([...exCurrencies.value, { ...c }])
}
function exDelete(code: string) {
  const list = exCurrencies.value.filter((c) => c.code !== code)
  if (list.length < 2) return // 至少保留 2 个币种才能换算
  updateCurrencies(list)
  if (exFrom.value === code) exFrom.value = list[0].code
  if (exTo.value === code) exTo.value = list.find((c) => c.code !== exFrom.value)?.code || list[0].code
}
async function openExManage() {
  exManage.value = true
  await nextTick()
  if (exListEl.value) {
    exSortable = Sortable.create(exListEl.value, {
      handle: '.wb-ex__grip',
      animation: 160,
      ghostClass: 'wb-ex__ghost',
      onEnd: () => {
        if (!exListEl.value) return
        const codes = [...exListEl.value.children].map((el) => (el as HTMLElement).dataset.code || '')
        const newList = codes
          .map((code) => exCurrencies.value.find((c) => c.code === code))
          .filter((c): c is { code: string; name: string; symbol: string } => !!c)
        if (newList.length) updateCurrencies(newList)
      },
    })
  }
}
function closeExManage() {
  exManage.value = false
  exSortable?.destroy()
  exSortable = null
}
// 以 USD 为基准的汇率表（rates[code] = 1 单位该币 = 多少 USD 的倒数；这里存的是「多少该币 = 1 USD」）
const exRates = ref<Record<string, number>>({ ...EX_FALLBACK })
const exSource = ref<'loading' | 'live' | 'offline'>('loading')
const exUpdated = ref('')
let exLoaded = false
/** 接口返回的 time_last_update_utc 为 UTC（+0000）；转换为北京时间（Asia/Shanghai, UTC+8）并以中文呈现。
 *  例如 "Sat, 05 Sep 2026 00:02:32 +0000" → "2026年09月05日 周六 08:02:32" */
function formatBeijingTime(utcStr: string): string {
  if (!utcStr) return ''
  const d = new Date(utcStr)
  if (isNaN(d.getTime())) return utcStr
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return `${get('year')}年${get('month')}月${get('day')}日 ${get('weekday')} ${get('hour')}:${get('minute')}:${get('second')}`
}
/** fawazahmed0 源只返回日期（YYYY-MM-DD，无时间）→ 转为北京时间中文「年月日 周X」（不显示时刻） */
function formatBeijingDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return `${get('year')}年${get('month')}月${get('day')}日 ${get('weekday')}`
}
async function loadRates(force = false) {
  if (exLoaded && !force) return
  exSource.value = 'loading'
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 6000)
  try {
    // 主数据源：fawazahmed0/exchange-api（jsDelivr CDN，免 Key、无频率限制、约 340 币种）
    // 返回结构：{ date: 'YYYY-MM-DD', usd: { cny: 7.1, jpy: 147, ... } }（小写代码；usd 为基准）
    const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      signal: ctrl.signal,
    })
    const j = await r.json()
    if (j && j.usd && typeof j.usd === 'object') {
      // 转为大写代码，与 EX_FALLBACK / 列表保持一致
      exRates.value = Object.fromEntries(
        Object.entries(j.usd as Record<string, number>).map(([k, v]) => [k.toUpperCase(), v]),
      )
      exSource.value = 'live'
      exUpdated.value = j.date ? formatBeijingDate(String(j.date)) : ''
      exLoaded = true
      return
    }
    throw new Error('bad fawazahmed0 payload')
  } catch {
    // 兜底源：open.er-api.com（每日刷新）
    try {
      const r2 = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal })
      const j2 = await r2.json()
      if (j2 && j2.result === 'success' && j2.rates) {
        exRates.value = j2.rates
        exSource.value = 'live'
        exUpdated.value = j2.time_last_update_utc ? formatBeijingTime(String(j2.time_last_update_utc)) : ''
        exLoaded = true
        return
      }
      throw new Error('bad er-api payload')
    } catch {
      exRates.value = { ...EX_FALLBACK }
      exSource.value = 'offline'
      exLoaded = true
    }
  } finally {
    window.clearTimeout(timer)
  }
}
const exNum = computed(() => {
  const s = exAmount.value.trim()
  if (!s) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
})
const exOut = computed(() => {
  const rates = exRates.value
  if (!rates || Number.isNaN(exNum.value)) return ''
  const rf = rates[exFrom.value]
  const rt = rates[exTo.value]
  if (!rf || !rt) return ''
  const usd = exNum.value / rf
  return fmtNum(usd * rt)
})
const exAll = computed(() => {
  const rates = exRates.value
  if (!rates || Number.isNaN(exNum.value)) return []
  const rf = rates[exFrom.value]
  if (!rf) return []
  const usd = exNum.value / rf
  return exCurrencies.value.map((c) => ({
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    text: fmtNum(usd * (rates[c.code] || 0)),
  }))
})
function exSwap() {
  const a = exFrom.value
  exFrom.value = exTo.value
  exTo.value = a
}

// —— 弹窗开关 ——
const toolName = computed(() => (active.value ? TOOL_META[active.value].name : '工具'))
function openTool(id: ToolId) {
  active.value = id
}
function closeTool() {
  // 注意：关闭番茄钟弹窗**不再**自动暂停——计时由 usePomodoro 单例在后台持续走表
  active.value = null
}

// 点击番茄钟状态条：确保在工作台视图，并打开番茄钟弹窗
function openPomoPop() {
  if (dash.view !== 'workbench') dash.setView('workbench')
  active.value = 'pomodoro'
}
const pomoLifecycleTip = computed(() => {
  if (pomo.lifecycle === 'running') return `番茄钟进行中 · ${pomo.remainStr}（点我进入）`
  if (pomo.lifecycle === 'paused') return `已暂停 · ${pomo.remainStr}（点我继续）`
  if (pomo.lifecycle === 'finished') return '时间到！点击打开番茄钟'
  return ''
})
// 时间戳工具需要「当前时间戳」实时跳秒：仅在该工具打开时开启秒级计时
watch(active, (v) => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = undefined
  }
  if (v === 'timestamp') {
    nowMs.value = Date.now()
    nowTimer = window.setInterval(() => (nowMs.value = Date.now()), 1000)
  }
  if (v === 'exchange') {
    normalizeEx()
    loadRates()
  }
})

// —— 标题自适应：字号过大先等比缩小，缩到下限仍放不下则隐藏多余字符 ——
const gridEl = ref<HTMLElement | null>(null)
const NAME_MIN_PX = 10
function fitName(span: HTMLElement) {
  span.style.fontSize = '' // 重置为 CSS 默认值后重新测量
  let fs = parseFloat(getComputedStyle(span).fontSize)
  // 单行放不下就逐步缩小字号（留 1px 容差），直到下限
  while (span.scrollWidth > span.clientWidth + 1 && fs > NAME_MIN_PX) {
    fs -= 0.5
    span.style.fontSize = fs.toFixed(1) + 'px'
  }
}
function fitAllNames() {
  const grid = gridEl.value
  if (!grid) return
  grid.querySelectorAll<HTMLElement>('.wb-tool-icon__name').forEach(fitName)
}
let nameRO: ResizeObserver | undefined
onMounted(() => {
  fitAllNames()
  if (gridEl.value && 'ResizeObserver' in window) {
    nameRO = new ResizeObserver(() => fitAllNames())
    nameRO.observe(gridEl.value)
  }
})
// 设置页改「显示标题 / 间距 / 排序」后重新测量（DOM 更新完成再算）
watch(
  () => [
    wb.getShowTitle(props.iid),
    cfg.value.rowGap,
    cfg.value.colGap,
    cfg.value.order.join(','),
  ],
  () => nextTick(fitAllNames),
)
onUnmounted(() => {
  nameRO?.disconnect()
  if (nowTimer) clearInterval(nowTimer)
})
</script>

<template>
  <WbCard :iid="iid" icon="wrench" class="wb-card--tools">
    <!--
      番茄钟状态条：与【实用工具箱】大标题同一行、头部右侧右对齐显示。
      - lifecycle=='running'：走表中，显示剩余时间（绿色）
      - lifecycle=='paused'：手动暂停，显示「⏸ 5:30」+「点我继续」（橙色）
      - lifecycle=='finished'：时间到短提示（3s 后自动转 idle 隐）
      - lifecycle=='idle'：不显示
      点击状态条打开番茄钟小工具弹窗；如不在工作台视图，自动切回工作台。
    -->
    <template #meta>
      <button
        v-if="pomo.lifecycle !== 'idle'"
        type="button"
        class="wb-tools__pomo"
        :class="'is-' + pomo.lifecycle"
        :title="pomoLifecycleTip"
        @click.stop="openPomoPop"
      >
        <template v-if="pomo.lifecycle === 'running'">
          <AppIcon name="timer" :size="13" /> <span>{{ pomo.remainStr }}</span>
        </template>
        <template v-else-if="pomo.lifecycle === 'paused'">
          <AppIcon name="pause" :size="13" /> <span>{{ pomo.remainStr }}</span><span class="wb-tools__pomo-extra">点我继续</span>
        </template>
        <template v-else>
          <AppIcon name="alarm-clock-check" :size="13" /> <span>时间到</span>
        </template>
      </button>
    </template>
    <div class="wb-tools">
      <!-- 工具选择网格（顺序 / 间距 / 标题显隐 均由设置页控制） -->
      <div
        class="wb-tools__grid"
        :class="{ 'is-noname': !wb.getShowTitle(props.iid) }"
        :style="gridStyle"
        ref="gridEl"
      >
        <button
          v-for="t in tools"
          :key="t.id"
          class="wb-tool-icon"
          :title="t.name"
          @click="openTool(t.id)"
        >
          <span class="wb-tool-icon__ic"><AppIcon :name="t.icon" :size="22" /></span>
          <span v-if="wb.getShowTitle(props.iid)" class="wb-tool-icon__name">{{ t.name }}</span>
        </button>
      </div>
    </div>

    <!-- 工具弹窗 -->
    <Teleport to="body">
      <div v-if="active" class="wb-pop__mask" @click.self="closeTool">
        <div class="wb-pop" :class="{ 'wb-pop--translate': active === 'translate' }" :style="active === 'translate' ? transPopStyle : null">
          <div class="wb-pop__head">
            <span class="wb-pop__title">{{ toolName }}</span>
            <button class="wb-cell__btn" @click="closeTool" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
          </div>
          <div class="wb-pop__body">
            <!-- 计算器 -->
            <template v-if="active === 'calc'">
              <div class="wb-calc">
                <div class="wb-calc__expr">{{ displayExpr }} <span class="wb-muted">= {{ result }}</span></div>
                <div class="wb-calc__keys">
                  <button
                    v-for="k in calcKeys"
                    :key="k.label"
                    :class="['wb-calc__k', k.op ? 'wb-calc__op' : '', k.cls || '']"
                    @click="press(k.val)"
                  >{{ k.label }}</button>
                </div>
                <button class="wb-calc__k wb-calc__clear wb-calc__wide" @click="calcClear">清空</button>
              </div>
            </template>

            <!-- 金额大小写 -->
            <template v-else-if="active === 'money'">
              <div class="wb-tool__label">金额大小写转换</div>
              <input class="wb-input" v-model="amount" placeholder="输入金额，如 1234.56" />
              <div v-if="amountOut" class="wb-out wb-out--click" @click="copyText(amountOut)" title="点击复制大写金额">
                大写：<b>{{ amountOut }}</b>
                <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
              </div>
            </template>

            <!-- 年龄计算 -->
            <template v-else-if="active === 'age'">
              <div class="wb-tool__label">年龄计算器</div>
              <label class="wb-field__label">快速输入</label>
              <input
                class="wb-input"
                v-model="ageQuick"
                placeholder="如 1990-05-20（支持 / . 分隔）"
                @change="applyAgeQuick"
                @keyup.enter="applyAgeQuick"
              />
              <label class="wb-field__label" style="margin-top:.6rem">或日历选择</label>
              <WbDatePicker v-model="birth" />
              <div v-if="ageOut && ageOut.valid" class="wb-out">
                {{ ageOut.years }} 岁 {{ ageOut.months }} 个月 {{ ageOut.days }} 天<br />
                生肖 <b>{{ ageOut.zodiac }}</b> · 距下次生日 <b>{{ ageOut.nextBirthdayInDays }}</b> 天
              </div>
              <div v-else-if="ageOut && !ageOut.valid" class="wb-out">请输入有效的出生日期</div>
            </template>

            <!-- 番茄钟 -->
            <template v-else-if="active === 'pomodoro'">
              <div class="wb-tool__label">番茄钟</div>
              <div class="wb-pomo">
                <svg class="wb-pomo__tomato" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <radialGradient id="wb-tom" cx="38%" cy="30%" r="72%">
                      <stop offset="0%" stop-color="#ff8a7a" />
                      <stop offset="55%" stop-color="#ef4444" />
                      <stop offset="100%" stop-color="#c81e1e" />
                    </radialGradient>
                  </defs>
                  <ellipse cx="32" cy="37" rx="23" ry="21" fill="url(#wb-tom)" />
                  <ellipse cx="24" cy="29" rx="7" ry="4.5" fill="#ffffff" opacity="0.32" />
                  <path d="M32 17 C29 10 24 8 20 9 C25 11 28 14 30 18 Z" fill="#34d399" />
                  <path d="M32 17 C35 10 40 8 44 9 C39 11 36 14 34 18 Z" fill="#22c55e" />
                  <path d="M32 18 C32 11 32 9 32 7 C33 10 33 14 32 19 Z" fill="#16a34a" />
                  <rect x="30.4" y="14" width="3.2" height="7" rx="1.6" fill="#65a30d" />
                </svg>
                <div class="wb-tool__timer">{{ pomo.remainStr }}</div>
                <div class="wb-pomo__bar"><span :style="{ width: pomo.progress + '%' }"></span></div>
                <div class="wb-pomo__quick">
                  <button v-for="m in [5, 10, 15, 30, 45, 60]" :key="m" class="wb-pomo__chip" @click="pomo.startWith(m)">{{ m >= 60 ? '1 小时' : m + ' 分钟' }}</button>
                </div>
                <div class="wb-tool__btns">
                  <button class="btn btn-sm" @click="pomo.running ? pomo.pause() : pomo.start()">{{ pomo.running ? '暂停' : (pomo.paused ? '继续' : '开始') }}</button>
                  <button class="btn btn-sm btn-ghost" @click="pomo.reset">重置</button>
                </div>
                <p v-if="pomo.state.finished" class="wb-muted" style="font-size:.75rem;margin:0">⏰ 时间到！</p>
              </div>
            </template>

            <!-- 单位换算（多分类） -->
            <template v-else-if="active === 'unit'">
              <div class="wb-cv">
                <div class="wb-row" style="margin-bottom:0">
                  <label>分类</label>
                  <WbSelect :options="catOpts" :model-value="uCatKey" @update:model-value="(v) => (uCatKey = String(v))" />
                </div>
                <div class="wb-cv__row">
                  <input class="wb-input" v-model="uVal" type="text" inputmode="decimal" placeholder="输入数值" />
                  <WbSelect :options="uOpts" :model-value="uFrom" @update:model-value="(v) => (uFrom = String(v))" />
                </div>
                <button class="wb-cv__swap" type="button" @click="uSwap">
                  <AppIcon name="arrow-up-down" :size="14" /> 交换单位
                </button>
                <div class="wb-cv__row">
                  <div class="wb-out wb-out--click" style="margin-top:0" @click="copyText(uOut)" :title="'点击复制：' + uOut">
                    <span class="wb-cv__res">{{ uOut || '—' }}</span>
                    <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
                  </div>
                  <WbSelect :options="uOpts" :model-value="uTo" @update:model-value="(v) => (uTo = String(v))" />
                </div>
                <div class="wb-tool__label" style="margin:.3rem 0 0">
                  {{ uVal || 0 }} {{ uOpts.find((o) => o.value === uFrom)?.label }} → {{ uToName }} 及全部单位
                </div>
                <div class="wb-cv__all">
                  <div
                    v-for="a in uAll"
                    :key="a.key"
                    class="wb-cv__all-item"
                    :class="{ 'is-cur': a.key === uTo }"
                  >
                    <span>{{ a.name }}</span><b>{{ a.text }}</b>
                  </div>
                  <div v-if="!uAll.length" class="wb-cv__all-item">请输入有效数值</div>
                </div>
              </div>
            </template>

            <!-- 长度换算 -->
            <template v-else-if="active === 'length'">
              <div class="wb-cv">
                <div class="wb-cv__row">
                  <input class="wb-input" v-model="len.val" type="text" inputmode="decimal" placeholder="输入长度数值" />
                  <WbSelect :options="len.opts" :model-value="len.from" @update:model-value="(v) => (len.from = String(v))" />
                </div>
                <button class="wb-cv__swap" type="button" @click="len.swap()">
                  <AppIcon name="arrow-up-down" :size="14" /> 交换单位
                </button>
                <div class="wb-cv__row">
                  <div class="wb-out wb-out--click" style="margin-top:0" @click="copyText(len.out)" :title="'点击复制：' + len.out">
                    <span class="wb-cv__res">{{ len.out || '—' }}</span>
                    <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
                  </div>
                  <WbSelect :options="len.opts" :model-value="len.to" @update:model-value="(v) => (len.to = String(v))" />
                </div>
                <div class="wb-tool__label" style="margin:.3rem 0 0">全部单位一览（目标：{{ len.toName }}）</div>
                <div class="wb-cv__all">
                  <div
                    v-for="a in len.all"
                    :key="a.key"
                    class="wb-cv__all-item"
                    :class="{ 'is-cur': a.key === len.to }"
                  >
                    <span>{{ a.name }}</span><b>{{ a.text }}</b>
                  </div>
                  <div v-if="!len.all.length" class="wb-cv__all-item">请输入有效数值</div>
                </div>
              </div>
            </template>

            <!-- 重量换算 -->
            <template v-else-if="active === 'weight'">
              <div class="wb-cv">
                <div class="wb-cv__row">
                  <input class="wb-input" v-model="wt.val" type="text" inputmode="decimal" placeholder="输入重量数值" />
                  <WbSelect :options="wt.opts" :model-value="wt.from" @update:model-value="(v) => (wt.from = String(v))" />
                </div>
                <button class="wb-cv__swap" type="button" @click="wt.swap()">
                  <AppIcon name="arrow-up-down" :size="14" /> 交换单位
                </button>
                <div class="wb-cv__row">
                  <div class="wb-out wb-out--click" style="margin-top:0" @click="copyText(wt.out)" :title="'点击复制：' + wt.out">
                    <span class="wb-cv__res">{{ wt.out || '—' }}</span>
                    <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
                  </div>
                  <WbSelect :options="wt.opts" :model-value="wt.to" @update:model-value="(v) => (wt.to = String(v))" />
                </div>
                <div class="wb-tool__label" style="margin:.3rem 0 0">全部单位一览（目标：{{ wt.toName }}）</div>
                <div class="wb-cv__all">
                  <div
                    v-for="a in wt.all"
                    :key="a.key"
                    class="wb-cv__all-item"
                    :class="{ 'is-cur': a.key === wt.to }"
                  >
                    <span>{{ a.name }}</span><b>{{ a.text }}</b>
                  </div>
                  <div v-if="!wt.all.length" class="wb-cv__all-item">请输入有效数值</div>
                </div>
              </div>
            </template>

            <!-- Base64 编解码 -->
            <template v-else-if="active === 'base64'">
              <div class="wb-cv">
                <div class="wb-cv__seg">
                  <button type="button" :class="{ 'is-active': b64Mode === 'enc' }" @click="b64Mode = 'enc'">文本 → Base64</button>
                  <button type="button" :class="{ 'is-active': b64Mode === 'dec' }" @click="b64Mode = 'dec'">Base64 → 文本</button>
                </div>
                <textarea
                  class="wb-textarea"
                  v-model="b64In"
                  :placeholder="b64Mode === 'enc' ? '输入要编码的文本（支持中文）' : '粘贴 Base64 字符串'"
                ></textarea>
                <div class="wb-tool__label" style="margin:0">结果</div>
                <div
                  class="wb-out"
                  :class="{ 'wb-out--click': b64Out && !b64Bad }"
                  style="margin-top:0"
                  @click="!b64Bad && copyText(b64Out)"
                >
                  {{ b64Out || '—' }}
                  <span v-if="b64Out && !b64Bad" class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
                </div>
              </div>
            </template>

            <!-- 日期推算 -->
            <template v-else-if="active === 'dateCalc'">
              <div class="wb-tool__label">日期加减</div>
              <div class="wb-row">
                <label>起始日期</label>
                <WbDatePicker v-model="dcBase" />
              </div>
              <div class="wb-row">
                <label>方向</label>
                <div class="wb-cv__seg">
                  <button type="button" :class="{ 'is-active': dcDir === 1 }" @click="dcDir = 1">之后</button>
                  <button type="button" :class="{ 'is-active': dcDir === -1 }" @click="dcDir = -1">之前</button>
                </div>
              </div>
              <div class="wb-cv__row" style="margin-bottom:.7rem">
                <input class="wb-input" v-model.number="dcN" type="number" min="0" step="1" placeholder="数量" />
                <WbSelect :options="dcUnitOpts" :model-value="dcUnit" @update:model-value="(v) => (dcUnit = v as 'day' | 'week' | 'month' | 'year')" />
              </div>
              <div v-if="dcOut" class="wb-out wb-out--click" @click="copyText(dcOut.date)">
                <b>{{ dcOut.date }}</b> {{ dcOut.week }} · 农历{{ dcOut.lunar }}<br />
                与起始日期相差 <b>{{ Math.abs(dcOut.days) }}</b> 天
                <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
              </div>
              <div v-else class="wb-out">请输入有效的起始日期与数量</div>

              <div class="wb-tool__label" style="margin-top:1rem">两个日期相差</div>
              <div class="wb-row">
                <label>起始日期</label>
                <WbDatePicker v-model="dcA" />
              </div>
              <div class="wb-row">
                <label>结束日期</label>
                <WbDatePicker v-model="dcB" />
              </div>
              <div v-if="dcDiff" class="wb-out">
                相差 <b>{{ dcDiff.days }}</b> 天（约 {{ dcDiff.weeks }} 周 / {{ dcDiff.months }} 个月 / {{ dcDiff.years }} 年）
                <template v-if="dcDiff.days < 0"><br /><span class="wb-muted">结束日期早于起始日期，故为负数</span></template>
              </div>
              <div v-else class="wb-out">请选择两个有效日期</div>
            </template>

            <!-- 时间戳转换 -->
            <template v-else-if="active === 'timestamp'">
              <div class="wb-tool__label">当前时间</div>
              <div class="wb-out" style="margin-top:0">
                <dl class="wb-kv">
                  <dt>秒级</dt><dd>{{ Math.floor(nowMs / 1000) }}</dd>
                  <dt>毫秒级</dt><dd>{{ nowMs }}</dd>
                  <dt>本地时间</dt><dd>{{ toDateTimeStr(new Date(nowMs)) }}</dd>
                </dl>
              </div>

              <div class="wb-tool__label" style="margin-top:1rem">时间戳 → 日期时间</div>
              <div class="wb-cv__row" style="margin-bottom:.5rem">
                <input class="wb-input" v-model="tsIn" type="text" inputmode="numeric" placeholder="粘贴 10 位（秒）或 13 位（毫秒）时间戳" />
                <button class="btn btn-sm btn-ghost" type="button" @click="useNowTs">取当前</button>
              </div>
              <div v-if="tsOut && !tsOut.bad" class="wb-out wb-out--click" style="margin-top:0" @click="copyText(tsOut.local)">
                <dl class="wb-kv">
                  <dt>本地时间</dt><dd>{{ tsOut.local }} {{ tsOut.week }}</dd>
                  <dt>UTC</dt><dd>{{ tsOut.iso }}</dd>
                </dl>
                <span class="wb-muted" style="font-size:.75rem">{{ tsOut.unit }}</span>
                <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
              </div>
              <div v-else-if="tsOut" class="wb-out" style="margin-top:0">时间戳需为纯数字</div>

              <div class="wb-tool__label" style="margin-top:1rem">日期时间 → 时间戳</div>
              <div class="wb-cv__row" style="margin-bottom:.5rem">
                <input class="wb-input" v-model="dtIn" type="datetime-local" step="1" />
                <button class="btn btn-sm btn-ghost" type="button" @click="useNowDt">取当前</button>
              </div>
              <div v-if="dtOut" class="wb-out wb-out--click" style="margin-top:0" @click="copyText(String(dtOut.sec))">
                <dl class="wb-kv">
                  <dt>秒级</dt><dd>{{ dtOut.sec }}</dd>
                  <dt>毫秒级</dt><dd>{{ dtOut.ms }}</dd>
                </dl>
                <span class="wb-out__tip">{{ copied ? '已复制（秒级）' : '点击复制秒级' }}</span>
              </div>
              <div v-else class="wb-out" style="margin-top:0">请选择有效的日期时间</div>
            </template>

            <!-- 农历转换 -->
            <template v-else-if="active === 'lunar'">
              <div class="wb-tool__label">公历 → 农历</div>
              <div class="wb-row">
                <label>公历日期</label>
                <WbDatePicker v-model="lunarIn" />
              </div>
              <div v-if="lunarOut" class="wb-out" style="margin-top:0">
                <dl class="wb-kv">
                  <dt>农历</dt><dd>{{ lunarOut.l.ganzhiYear }}年 {{ lunarOut.l.monthText }}{{ lunarOut.l.dayText }}</dd>
                  <dt>生肖</dt><dd>{{ lunarOut.l.zodiac }}</dd>
                  <dt>星期</dt><dd>{{ lunarOut.week }}</dd>
                  <dt v-if="lunarOut.l.term">节气</dt><dd v-if="lunarOut.l.term">{{ lunarOut.l.term }}</dd>
                </dl>
              </div>
              <div v-else class="wb-out" style="margin-top:0">请选择有效日期</div>
              <p class="wb-muted" style="font-size:.75rem;margin-top:.5rem">
                支持 1900–2100 年；闰月会在月份前标「闰」。
              </p>
            </template>

            <!-- 汇率换算 -->
            <template v-else-if="active === 'exchange'">
              <div class="wb-ex">
                <div class="wb-ex__top">
                  <div class="wb-tool__label" style="margin:0">汇率换算</div>
                  <button class="wb-ex__manage-btn" type="button" @click="exManage ? closeExManage() : openExManage()">
                    <AppIcon :name="exManage ? 'check' : 'settings-2'" :size="13" />
                    {{ exManage ? '完成' : '管理货币' }}
                  </button>
                </div>

                <!-- 换算视图 -->
                <template v-if="!exManage">
                  <div class="wb-cv__row">
                    <input class="wb-input" v-model="exAmount" type="text" inputmode="decimal" placeholder="输入金额" />
                    <WbSelect :options="exOpts" :model-value="exFrom" @update:model-value="(v) => (exFrom = String(v))" />
                  </div>
                  <button class="wb-cv__swap" type="button" @click="exSwap">
                    <AppIcon name="arrow-up-down" :size="14" /> 交换货币
                  </button>
                  <div class="wb-cv__row">
                    <div class="wb-out wb-out--click" style="margin-top:0" @click="copyText(exOut)" :title="'点击复制：' + exOut">
                      <span class="wb-cv__res">{{ exOut || '—' }}</span>
                      <span class="wb-out__tip">{{ copied ? '已复制' : '点击复制' }}</span>
                    </div>
                    <WbSelect :options="exOpts" :model-value="exTo" @update:model-value="(v) => (exTo = String(v))" />
                  </div>
                  <div class="wb-ex__bar">
                    <span class="wb-ex__src" :class="'is-' + exSource">
                      数据：{{ exSource === 'live' ? '当日' : exSource === 'offline' ? '离线估算' : '加载中…' }}
                      <template v-if="exSource === 'live' && exUpdated">（{{ exUpdated }}）</template>
                    </span>
                    <button class="wb-ex__refresh" type="button" :disabled="exSource === 'loading'" @click="loadRates(true)" title="刷新汇率">
                      <AppIcon name="refresh-cw" :size="13" :class="{ spin: exSource === 'loading' }" />
                    </button>
                  </div>
                  <div class="wb-tool__label" style="margin:.4rem 0 0">全部货币一览（基准：{{ exAmount || 0 }} {{ exFrom }}）</div>
                  <div class="wb-cv__all">
                    <div
                      v-for="a in exAll"
                      :key="a.code"
                      class="wb-cv__all-item"
                      :class="{ 'is-cur': a.code === exTo }"
                    >
                      <span>{{ a.name }} {{ a.symbol }}</span><b>{{ a.text }}</b>
                    </div>
                    <div v-if="!exAll.length" class="wb-cv__all-item">请输入有效金额</div>
                  </div>
                </template>

                <!-- 管理货币视图：增删 + 拖拽排序 -->
                <template v-else>
                  <div class="wb-ex__add">
                    <div class="wb-ex__add-row">
                      <input class="wb-input" v-model="addCode" type="text" maxlength="3" placeholder="代码(USD)" style="width:5.2rem;text-transform:uppercase" />
                      <input class="wb-input" v-model="addName" type="text" placeholder="名称(美元)" style="flex:1" />
                      <input class="wb-input" v-model="addSymbol" type="text" maxlength="4" placeholder="符号($)" style="width:4.4rem" />
                      <button class="btn btn-sm" type="button" @click="exAdd">添加</button>
                    </div>
                    <div v-if="exAddErr" class="wb-ex__err">{{ exAddErr }}</div>
                    <div v-if="exSuggest.length" class="wb-ex__suggest">
                      <span class="wb-muted">快速添加：</span>
                      <button
                        v-for="s in exSuggest"
                        :key="s.code"
                        class="wb-ex__chip"
                        type="button"
                        @click="exAddSuggest(s.code)"
                      >{{ s.name }}</button>
                    </div>
                  </div>
                  <div class="wb-tool__label" style="margin:.2rem 0 .3rem">已选币种（拖拽 grip 排序）</div>
                  <div class="wb-ex__list" ref="exListEl">
                    <div
                      v-for="c in exCurrencies"
                      :key="c.code"
                      class="wb-ex__cur"
                      :data-code="c.code"
                    >
                      <span class="wb-ex__grip" title="拖拽排序"><AppIcon name="grip-vertical" :size="15" /></span>
                      <span class="wb-ex__cur-name">{{ c.name }}</span>
                      <span class="wb-ex__cur-code">{{ c.code }}</span>
                      <span class="wb-ex__cur-sym">{{ c.symbol }}</span>
                      <button
                        class="wb-ex__del"
                        type="button"
                        :disabled="exCurrencies.length <= 2"
                        :title="exCurrencies.length <= 2 ? '至少保留 2 个币种' : '删除'"
                        @click="exDelete(c.code)"
                      >
                        <AppIcon name="x" :size="13" />
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </template>

            <!-- 翻译 -->
            <template v-else-if="active === 'translate'">
              <TranslateTool :iid="props.iid" />
            </template>

          </div>
        </div>
      </div>
    </Teleport>
  </WbCard>
</template>
