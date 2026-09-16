import { defineStore } from 'pinia'
import { reactive, ref, computed, watch, nextTick } from 'vue'
import { workbenchApi, type BiddingSource, type WorkbenchStateDTO, type HotlistSource, type HotlistProvider } from '@/api/workbench'
import { useAuthStore } from './auth'

/** 工作台网格列数（用户已选定 9 列） */
export const GRID_COLS = 9

/** 卡片 id（快捷书签已移除，股票改为自选股 watchlist，新增倒计时 countdown、常用链接 links） */
export type CardId = 'time' | 'weather' | 'calendar' | 'todo' | 'note' | 'watchlist' | 'tools' | 'countdown' | 'daycount' | 'bidding' | 'links' | 'hotlist' | 'worldclock'

/** 卡片尺寸（网格占位：w=列跨度，h=行跨度） */
export interface CardSize {
  w: number
  h: number
}

/** 倒计时目标 */
export interface CountdownTarget {
  id: number
  label: string
  kind: 'daily' | 'date' // daily=每天某时刻（value=HH:mm）；date=某日期（value=YYYY-MM-DD）
  value: string
}

/** 倒数日事件重复方式 */
export type DayCountRepeat = 'once' | 'yearly' | 'monthly' | 'weekly'

/** 倒数日事件：可添加多个，支持单次/每年/每月/每周重复 */
export interface DayCountEvent {
  id: number
  label: string
  repeat: DayCountRepeat
  date?: string // once: 'YYYY-MM-DD'
  month?: number // yearly: 1-12
  day?: number // yearly / monthly: 1-31
  wday?: number // weekly: 0-6（0=周日）
  color?: string // 可选强调色（十六进制）
}

/** 取下一次目标日期与距离天数（本地时区，按天取整）。overdue 仅单次事件且已过期时为真。 */
export function nextDayCountDate(
  ev: DayCountEvent,
  from: Date = new Date()
): { target: Date | null; days: number; overdue: boolean } {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  let target: Date | null = null
  if (ev.repeat === 'once' && ev.date) {
    const [y, m, d] = ev.date.split('-').map(Number)
    target = new Date(y, m - 1, d)
  } else if (ev.repeat === 'yearly' && ev.month && ev.day) {
    const m = ev.month - 1
    const d = Math.min(ev.day, dim(base.getFullYear(), m))
    let t = new Date(base.getFullYear(), m, d)
    if (t < base) t = new Date(base.getFullYear() + 1, m, d)
    target = t
  } else if (ev.repeat === 'monthly' && ev.day) {
    const d = Math.min(ev.day, dim(base.getFullYear(), base.getMonth()))
    let t = new Date(base.getFullYear(), base.getMonth(), d)
    if (t < base) {
      const nm = base.getMonth() + 1
      const ny = base.getFullYear() + (nm > 11 ? 1 : 0)
      t = new Date(ny, nm % 12, Math.min(ev.day, dim(ny, nm % 12)))
    }
    target = t
  } else if (ev.repeat === 'weekly' && typeof ev.wday === 'number') {
    const diff = (ev.wday - base.getDay() + 7) % 7
    target = new Date(base)
    target.setDate(base.getDate() + diff)
  }
  if (!target) return { target: null, days: 0, overdue: false }
  const days = Math.round((target.getTime() - base.getTime()) / 86400000)
  return { target, days, overdue: ev.repeat === 'once' && days < 0 }
}

/** 重复描述（用于卡片与设置页展示） */
export function describeDayCount(ev: DayCountEvent): string {
  const wk = ['日', '一', '二', '三', '四', '五', '六']
  switch (ev.repeat) {
    case 'once':
      return ev.date || ''
    case 'yearly':
      return `每年 ${ev.month} 月 ${ev.day} 日`
    case 'monthly':
      return `每月 ${ev.day} 日`
    case 'weekly':
      return `每${wk[ev.wday ?? 0]}`
  }
}

/** 待办项 */
export interface TodoItem {
  id: number
  text: string
  done: boolean
  category: string
  starred: boolean
}

/** 记事条目 */
export interface NoteItem {
  id: number
  title: string
  body: string
  updatedAt: number
}

/** 自选股持仓 */
export interface Holding {
  id: number
  code: string // 股票代码（如 600519 / sh600519）
  name?: string // 名称，优先由行情接口填充，缺失时回退为 code
  buyPrice: number // 持仓价格（买入价，必填）
  shares: number // 持仓数量（股数，必填）
  prevClose?: number // 昨收（实时行情填充）
  current?: number // 现价（实时行情填充）
  costDate?: string // 建仓日期（YYYY-MM-DD，可选）
}

/** 自选股行情自动刷新配置（仅 A 股开市时段生效） */
export interface WatchlistAutoRefresh {
  enabled: boolean // 是否开启开市时段自动刷新
  interval: number // 刷新间隔（秒）：1/10/30/60/300/600/1800/3600
}

/** 常用链接条目（上图标 + 下标题） */
export interface LinkItem {
  id: number
  title: string
  url: string
  icon: string // Lucide 图标名（默认 link）
  iconImg?: string // 图标图片地址（http(s) URL 或 data: URL），存在时优先于 icon 展示
}

/** 实时热搜偏好：多选平台 + 布局 + 数据源 + 条数 + 间隔自动刷新 */
export interface HotlistPrefs {
  /** 多选展示的平台（设置页勾选，最终按勾选逐平台抓取） */
  platforms: HotlistSource[]
  /** 布局：tabs=点 tab 切换平台；columns=各平台单列并排、无需切换 */
  layout: 'tabs' | 'columns'
  /** 数据源：auto=优先 apizero 失败/串台回退 uapis；apizero/uapis=仅用指定源 */
  provider: HotlistProvider
  limit: number // 展示条数：5/10/15/20/30/50
  autoRefresh: boolean // 是否开启间隔自动刷新
  interval: number // 刷新间隔（秒）：60/300/600/900/1800/3600/10800/21600/43200/86400
  uapisKey: string // uapis 会员 API Key（Bearer），填写后 uapis 走会员通道获取更高额度；留空用访客额度
}

/** 世界时间城市（纯前端 Intl.DateTimeFormat(timeZone) 计算，无需后端） */
export interface WorldCity {
  name: string // 显示名（如「雅加达」）
  timeZone: string // IANA 时区标识（如 Asia/Shanghai、America/New_York）
  country?: string // 预设城市：所在国家/地区名（显示于城市名后方的灰色小字）
  iso?: string // ISO 3166-1 alpha-2（国旗图片；预设有，自定义由 tz 推导）
}

/** 国家/地区名 → ISO 3166-1 alpha-2（用于国旗图片） */
const COUNTRY_ISO: Record<string, string> = {
  中国: 'cn', 日本: 'jp', 韩国: 'kr', 新加坡: 'sg', 印度尼西亚: 'id', 印尼: 'id',
  阿联酋: 'ae', 俄罗斯: 'ru', 德国: 'de', 法国: 'fr', 英国: 'gb',
  美国: 'us', 澳大利亚: 'au',
}
/** IANA 时区 → ISO 3166-1 alpha-2（自定义城市按 tz 推导国旗） */
const TZ_ISO: Record<string, string> = {
  'Asia/Shanghai': 'cn', 'Asia/Hong_Kong': 'hk', 'Asia/Macau': 'mo', 'Asia/Urumqi': 'cn',
  'Asia/Tokyo': 'jp', 'Asia/Seoul': 'kr', 'Asia/Singapore': 'sg', 'Asia/Kuala_Lumpur': 'my',
  'Asia/Jakarta': 'id', 'Asia/Bangkok': 'th', 'Asia/Manila': 'ph',
  'Asia/Kolkata': 'in', 'Asia/Taipei': 'tw', 'Asia/Dubai': 'ae', 'Asia/Riyadh': 'sa',
  'Europe/Moscow': 'ru', 'Europe/Berlin': 'de', 'Europe/Paris': 'fr', 'Europe/London': 'gb',
  'Europe/Madrid': 'es', 'Europe/Rome': 'it', 'Europe/Istanbul': 'tr',
  'America/New_York': 'us', 'America/Chicago': 'us', 'America/Los_Angeles': 'us', 'America/Sao_Paulo': 'br',
  'Australia/Sydney': 'au', 'Pacific/Auckland': 'nz',
}
/** 时区别名修正：部分新/历史时区（如 Asia/Surabaya，IANA 2023 新增）在部分浏览器 ICU 未收录，
 *  会触发 Intl.DateTimeFormat 抛 RangeError 而被整条丢弃；统一映射到稳定可用的规范时区。
 *  泗水属印尼西部时区（WIB/UTC+7），与雅加达同区，故映射到 Asia/Jakarta。 */
const TZ_ALIASES: Record<string, string> = {
  'Asia/Surabaya': 'Asia/Jakarta',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Chungking': 'Asia/Chongqing',
}
/** 将时区归一到规范标识；未知时区原样返回（交由下游校验/容错处理） */
function normalizeTimeZone(tz: string): string {
  return TZ_ALIASES[tz] ?? tz
}
/** 国家/地区名别名归一：历史数据或旧预设可能使用较长写法（如「印度尼西亚」），
 *  统一收敛为简写「印尼」，避免同一国家出现两种标注。 */
const COUNTRY_ALIASES: Record<string, string> = {
  印度尼西亚: '印尼',
}
/** 将国家名归一到规范简称；未知原样返回 */
function normalizeCountry(c: string): string {
  return COUNTRY_ALIASES[c] ?? c
}
/** 世界时间城市列表归一化：过滤非法条目、校验 IANA 时区可用性、时区别名修正、
 *  国家名归一（如「印度尼西亚」→「印尼」）。既用于 legacy prefs 分支，也用于新格式实例 config。 */
function normalizeWorldCities(list: unknown): WorldCity[] {
  if (!Array.isArray(list)) return []
  const cities = (list as unknown[])
    .map((x) => {
      const o = x as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      const tz = typeof o.timeZone === 'string' ? normalizeTimeZone(o.timeZone.trim()) : ''
      if (!name || !tz) return null
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
      } catch {
        return null
      }
      const rawCountry = typeof o.country === 'string' ? o.country.trim() : ''
      const country = rawCountry ? normalizeCountry(rawCountry) : undefined
      const iso = typeof o.iso === 'string' && o.iso.trim() ? o.iso.trim().toUpperCase() : undefined
      return { name, timeZone: tz, ...(country ? { country } : {}), ...(iso ? { iso } : {}) }
    })
    .filter((x): x is WorldCity => x !== null)
  return cities
}
/** 由城市推导 ISO 3166-1 alpha-2（找不到返回空串） */
export function cityIso(c: WorldCity): string {
  return (c.iso || COUNTRY_ISO[c.country ?? ''] || TZ_ISO[c.timeZone] || '').toUpperCase()
}
/** 由城市推导国旗图片地址（flagcdn.com；离线/失败降级为 ISO 代码文字） */
export function cityFlagUrl(c: WorldCity): string {
  const iso = cityIso(c).toLowerCase()
  return iso ? `https://flagcdn.com/w40/${iso}.png` : ''
}
/** 城市显示名：仅显示城市名（国家以城市名后方的灰色小字另注，不再拼进名称） */
export function cityLabel(c: WorldCity): string {
  return c.name
}

/** 世界时间常用城市预设（设置页一键添加；含国家名与 ISO 用于国旗 + 城市名后灰色小字国家标注） */
export const WORLDCLOCK_PRESETS: WorldCity[] = [
  { name: '北京', timeZone: 'Asia/Shanghai', country: '中国', iso: 'CN' },
  { name: '东京', timeZone: 'Asia/Tokyo', country: '日本', iso: 'JP' },
  { name: '首尔', timeZone: 'Asia/Seoul', country: '韩国', iso: 'KR' },
  { name: '新加坡', timeZone: 'Asia/Singapore', country: '新加坡', iso: 'SG' },
  { name: '雅加达', timeZone: 'Asia/Jakarta', country: '印尼', iso: 'ID' },
  { name: '泗水', timeZone: 'Asia/Jakarta', country: '印尼', iso: 'ID' },
  { name: '迪拜', timeZone: 'Asia/Dubai', country: '阿联酋', iso: 'AE' },
  { name: '莫斯科', timeZone: 'Europe/Moscow', country: '俄罗斯', iso: 'RU' },
  { name: '柏林', timeZone: 'Europe/Berlin', country: '德国', iso: 'DE' },
  { name: '巴黎', timeZone: 'Europe/Paris', country: '法国', iso: 'FR' },
  { name: '伦敦', timeZone: 'Europe/London', country: '英国', iso: 'GB' },
  { name: '纽约', timeZone: 'America/New_York', country: '美国', iso: 'US' },
  { name: '洛杉矶', timeZone: 'America/Los_Angeles', country: '美国', iso: 'US' },
  { name: '悉尼', timeZone: 'Australia/Sydney', country: '澳大利亚', iso: 'AU' },
]

/** 世界时间默认城市（在初始 4 城基础上增加雅加达/泗水/新加坡/首尔） */
export const DEFAULT_WORLDCLOCK: { cities: WorldCity[] } = {
  cities: [
    { name: '北京', timeZone: 'Asia/Shanghai', country: '中国', iso: 'CN' },
    { name: '伦敦', timeZone: 'Europe/London', country: '英国', iso: 'GB' },
    { name: '纽约', timeZone: 'America/New_York', country: '美国', iso: 'US' },
    { name: '东京', timeZone: 'Asia/Tokyo', country: '日本', iso: 'JP' },
    { name: '雅加达', timeZone: 'Asia/Jakarta', country: '印尼', iso: 'ID' },
    { name: '泗水', timeZone: 'Asia/Jakarta', country: '印尼', iso: 'ID' },
    { name: '新加坡', timeZone: 'Asia/Singapore', country: '新加坡', iso: 'SG' },
    { name: '首尔', timeZone: 'Asia/Seoul', country: '韩国', iso: 'KR' },
  ],
  lineGap: 8,
}

/** 工具箱小工具 id（前 4 个为初版工具，其余为扩展工具） */
export type ToolId = 'calc' | 'money' | 'age' | 'pomodoro' | 'unit' | 'length' | 'weight' | 'base64' | 'dateCalc' | 'timestamp' | 'lunar' | 'exchange' | 'translate'

/** 工具箱偏好：小工具标题显隐 / 网格行列间距 / 自定义排序 */
export interface ToolsPrefs {
  showTitle: boolean
  rowGap: number
  colGap: number
  order: ToolId[]
}

/** 各卡片偏好 / 数据（统一持久化到 localStorage） */
export interface WbPrefs {
  showTitle: Record<CardId, boolean> // 各卡片是否显示标题
  calendar: { showLunar: boolean; rowGap: number; colGap: number; autoFill: boolean }
  countdown: { targets: CountdownTarget[] }
  daycount: { events: DayCountEvent[]; lineGap: number } // lineGap=事件行间距(px)
  todo: { defaultCategory: string; showCompleted: boolean; lineGap: number; fontSize: number; categories: string[]; items: TodoItem[] }
  note: { sortBy: 'updatedAt' | 'title'; lineGap: number; fontSize: number; pad: number; outerPad: number; closeOnMask: boolean; items: NoteItem[] }
  watchlist: { holdings: Holding[]; autoRefresh: WatchlistAutoRefresh }
  quote: { refreshMinutes: number } // 一言换新间隔（分钟，0=关闭；严格按间隔换句，不再每次打开随机）
  tools: ToolsPrefs
  weather: { city: string; apiKey?: string; host?: string; auth?: 'key' | 'jwt'; refreshMode?: 'interval' | 'schedule' | 'off'; refreshInterval?: number; refreshTimes?: string[] } // apiKey=和风天气 Key（需申请）；host=接入点（默认 api.qweather.com）；auth=认证方式 key=API KEY 查询参数 / jwt=JWT Bearer（和风推荐，2027 起免限流）；refreshMode=刷新方式（interval 间隔/schedule 指定时间/off 关闭，默认 interval）；refreshInterval=间隔分钟(10/60/360/720/1440)；refreshTimes=每日刷新时间点(HH:MM)
  bidding: { sources: BiddingSource[]; autoFetch: boolean; fetchInterval: number } // 自动抓取开关 + 间隔（分钟）
  links: { items: LinkItem[] }
  hotlist: HotlistPrefs // 实时热搜：多选平台 / 布局 / 数据源 / 条数 / 间隔自动刷新
  worldclock: { cities: WorldCity[] } // 世界时间：自定义显示的城市（name + timeZone，预设含 country/iso 用于国旗与城市名后灰字国家标注）
  translate: TranslatePrefs // 翻译：DeepSeek 代理（apiKey 设置页填写，model 可选 chat/reasoner，from/to 语言对）
  /** 汇率换算可选币种列表（用户可增删/拖拽排序，持久化到 localStorage/账户） */
  exchangeCurrencies: { code: string; name: string; symbol: string }[]
}

/** 翻译模型（DeepSeek） */
export type TranslateModel = 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-flash' | 'deepseek-v4-pro'
/** 翻译语言（auto=自动识别源语言） */
export type TranslateLang = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'
/** 翻译颜色（自定义配色；accent 必填，bg/fg 留空则跟随主题） */
export interface TranslateColors {
  accent: string // 主色（按钮/高亮），默认 #f59e0b
  bg: string // 背景色（空=跟随主题）
  fg: string // 文字色（空=跟随主题）
}
/** 翻译弹窗尺寸（视口百分比；vw=宽，vh=高；范围 30–95） */
export interface TranslateSize {
  vw: number // 宽度（视口宽度的百分比，30–95）
  vh: number // 高度（视口高度的百分比，30–95）
}
/** 翻译偏好（DeepSeek 经后端代理） */
export interface TranslatePrefs {
  apiKey: string // DeepSeek API Key（设置页填写，存 localStorage；前端带给后端代理，不写死在前端代码）
  model: TranslateModel // 默认 deepseek-chat（快·省）；reasoner=R1 推理更强但慢且贵
  from: TranslateLang // 源语言（auto=自动识别）
  to: TranslateLang // 目标语言
  tm: boolean // 是否启用翻译记忆（命中本地历史译文，免去重复调用）
  colors?: TranslateColors // 自定义配色（主色/背景/文字；留空项跟随主题）
  size?: TranslateSize // 弹窗尺寸（视口百分比；缺省回退 40×60）
}
/** 翻译模型可选项（设置页下拉） */
export const TRANSLATE_MODELS: { value: TranslateModel; label: string }[] = [
  { value: 'deepseek-flash', label: 'deepseek-flash（推荐·V4.1·快·省·多模态）' },
  { value: 'deepseek-chat', label: 'deepseek-chat（V3·通用·稳定·快）' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner（R1·推理强·慢）' },
  { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro（9/14 起停用→flash）' },
]
/** 翻译方向预设（卡片 / 设置页共用）：映射为 from/to */
export const TRANSLATE_DIRS: { value: string; label: string; from: TranslateLang; to: TranslateLang }[] = [
  { value: 'zh-en', label: '中文 → 英文', from: 'zh', to: 'en' },
  { value: 'en-zh', label: '英文 → 中文', from: 'en', to: 'zh' },
  { value: 'auto', label: '自动检测 → 英文', from: 'auto', to: 'en' },
  { value: 'auto-zh', label: '自动检测 → 中文', from: 'auto', to: 'zh' },
]

/** 单个小组件实例：同一类型可添加多个实例（如多个天气组件各设不同城市），
 *  每个实例拥有独立的 config（偏好/数据）、尺寸、显隐与标题等元信息。 */
export interface WidgetInstance {
  iid: string
  type: CardId
  title?: string
  hidden: boolean
  showTitle: boolean
  autoHeight: boolean
  size: CardSize
  config: Record<string, any>
}

/** 各卡片默认元数据：名称 + 图标 + 一句话描述（组件库与设置页共用） */
export const WIDGET_META: Record<CardId, { name: string; icon: string; desc: string }> = {
  time: { name: '时钟', icon: 'clock', desc: '本地时间' },
  weather: { name: '天气', icon: 'cloud-sun', desc: '实时天气' },
  calendar: { name: '日历', icon: 'calendar', desc: '日程视图' },
  todo: { name: '待办', icon: 'check-square', desc: '任务清单' },
  note: { name: '记事', icon: 'sticky-note', desc: '随手记录' },
  watchlist: { name: '自选股', icon: 'line-chart', desc: '股票行情' },
  tools: { name: '工具箱', icon: 'wrench', desc: '实用工具' },
  countdown: { name: '倒计时', icon: 'timer', desc: '目标日' },
  daycount: { name: '倒数日', icon: 'calendar-clock', desc: '纪念/节日倒计时' },
  bidding: { name: '招标信息', icon: 'gavel', desc: '聚合抓取' },
  links: { name: '常用链接', icon: 'link', desc: '网址导航' },
  hotlist: { name: '实时热搜', icon: 'flame', desc: '实时榜单' },
  worldclock: { name: '世界时间', icon: 'globe', desc: '多时区' },
}

/** 工作台全部小组件实例（替代旧 order/sizes/prefs 三段式） */
interface WbData {
  instances: WidgetInstance[]
  /** 一言换新间隔（页眉单例，非网格小组件，独立持久化） */
  quote: { refreshMinutes: number }
}

/** 归一化中间态：旧 order/sizes/prefs 三段式（仅用于迁移与数据校验） */
interface LegacyWbData {
  order: CardId[]
  sizes: Record<CardId, CardSize>
  prefs: WbPrefs
}

/** 原始状态（localStorage / 服务端返回的宽松结构）；归一化与类型收紧交给 normalizeState 统一处理。 */
interface RawWbState {
  order?: unknown[]
  sizes?: Record<string, { w?: number; h?: number }>
  prefs?: Record<string, unknown>
  instances?: unknown[]
}

const STORAGE_KEY = 'wb_state_v1'

function uid(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

const DEFAULT_ORDER: CardId[] = [
  'time',
  'weather',
  'countdown',
  'calendar',
  'watchlist',
  'note',
  'todo',
  'tools',
  'links',
  'hotlist',
  'bidding',
  'worldclock',
  'daycount',
]

/** 自选股开市自动刷新默认值：开启、间隔 30 秒（开市时段内每 30s 拉一次行情） */
export const DEFAULT_WL_AUTOREFRESH: WatchlistAutoRefresh = { enabled: true, interval: 30 }
/** 自选股自动刷新间隔白名单（秒） */
export const WL_AUTOREFRESH_INTERVALS = [1, 10, 30, 60, 300, 600, 1800, 3600]
/** 天气自动刷新间隔白名单（分钟）：10 分钟 / 1 小时 / 6 小时 / 12 小时 / 24 小时 */
export const WEATHER_REFRESH_INTERVALS = [10, 60, 360, 720, 1440]
/** 每日一言换新间隔白名单（分钟）：0=关闭 / 1 分钟 / 15 分钟 / 30 分钟 / 1 小时 / 6 小时 / 12 小时 / 24 小时 */
export const QUOTE_REFRESH_INTERVALS = [0, 1, 15, 30, 60, 360, 720, 1440]
/** 实时热搜默认偏好：全平台 / 标签切换布局 / 自动数据源 / 20 条 / 开启间隔自动刷新（60s） */
export const DEFAULT_HOTLIST: HotlistPrefs = {
  platforms: ['weibo', 'zhihu', 'bilibili', 'douyin', 'baidu', 'tieba', '36kr', 'ithome', 'thepaper', 'toutiao'],
  layout: 'tabs',
  provider: 'auto',
  limit: 20,
  autoRefresh: true,
  interval: 60,
  uapisKey: '',
}
/** 热搜平台白名单（与后端 _HOTLIST_SRCS 严格对齐，value 即 uapis type 标识） */
export const HOTLIST_SRCS: { value: HotlistSource; label: string }[] = [
  { value: 'bilibili', label: '哔哩哔哩' },
  { value: 'weibo', label: '微博' },
  { value: 'zhihu', label: '知乎' },
  { value: 'zhihu-daily', label: '知乎日报' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'baidu', label: '百度' },
  { value: 'tieba', label: '百度贴吧' },
  { value: '52pojie', label: '吾爱破解' },
  { value: 'coolapk', label: '酷安' },
  { value: 'thepaper', label: '澎湃新闻' },
  { value: 'toutiao', label: '今日头条' },
  { value: 'qq-news', label: '腾讯新闻' },
  { value: 'netease-news', label: '网易新闻' },
  { value: 'huxiu', label: '虎嗅' },
  { value: 'sspai', label: '少数派' },
  { value: 'ithome', label: 'IT之家' },
  { value: '36kr', label: '36氪' },
  { value: 'nodeseek', label: 'NodeSeek' },
  { value: 'hellogithub', label: 'HelloGitHub' },
  { value: 'netease-music', label: '网易云音乐' },
  { value: 'qq-music', label: 'QQ音乐' },
]
/** 热搜数据源（设置页可切换；auto=优先 apizero，串台/失败回退 uapis） */
export const HOTLIST_PROVIDERS: { value: HotlistProvider; label: string }[] = [
  { value: 'auto', label: '自动（优先 apizero）' },
  { value: 'apizero', label: 'apizero' },
  { value: 'uapis', label: 'uapis' },
]
/** 热搜布局：标签切换 / 分栏并排 */
export const HOTLIST_LAYOUTS: { value: 'tabs' | 'columns'; label: string }[] = [
  { value: 'tabs', label: '标签切换' },
  { value: 'columns', label: '分栏并排' },
]
/** 热搜展示条数白名单 */
export const HOTLIST_LIMITS = [5, 10, 15, 20, 30, 50]
/** 热搜自动刷新间隔白名单（秒）：1分/5分/10分/15分/30分/1时/3时/6时/12时/24时 */
export const HOTLIST_INTERVALS = [60, 300, 600, 900, 1800, 3600, 10800, 21600, 43200, 86400]
/** 工具箱小工具默认顺序（新增工具追加到末尾即可，normalizeState 会自动补齐） */
export const DEFAULT_TOOL_ORDER: ToolId[] = [
  'calc',
  'money',
  'age',
  'pomodoro',
  'unit',
  'length',
  'weight',
  'base64',
  'dateCalc',
  'timestamp',
  'lunar',
  'exchange',
  'translate',
]
/** 工具箱网格默认间距（px，对应旧 CSS gap:.6rem≈10px） */
export const DEFAULT_TOOL_GAP = 10
/** 小工具展示元信息（名称 + Lucide 图标名）：卡片网格与设置页排序列表共用同一份 */
export const TOOL_META: Record<ToolId, { name: string; icon: string }> = {
  calc: { name: '计算器', icon: 'calculator' },
  money: { name: '金额大小写', icon: 'coins' },
  age: { name: '年龄计算', icon: 'calendar-clock' },
  pomodoro: { name: '番茄钟', icon: 'timer' },
  unit: { name: '单位换算', icon: 'arrow-left-right' },
  length: { name: '长度换算', icon: 'ruler' },
  weight: { name: '重量换算', icon: 'scale' },
  base64: { name: 'Base64', icon: 'binary' },
  dateCalc: { name: '日期推算', icon: 'calendar-plus' },
  timestamp: { name: '时间戳转换', icon: 'hourglass' },
  lunar: { name: '农历转换', icon: 'moon' },
  exchange: { name: '汇率换算', icon: 'banknote' },
  translate: { name: '翻译', icon: 'languages' },
}

// 9 列布局默认尺寸（整齐平铺，无空洞）：
// 行1 = time(3)+weather(3)+countdown(3)=9；行2-4 = calendar(3×3)+watchlist(3×3)+note(3×3)=9；
// 行5-6 = todo(3×2)+tools(3×2)+links(3×2)=9；行7-9 = bidding(9×3) 整宽。
const DEFAULT_SIZES: Record<CardId, CardSize> = {
  time: { w: 3, h: 1 },
  weather: { w: 3, h: 1 },
  countdown: { w: 3, h: 1 },
  daycount: { w: 3, h: 2 },
  calendar: { w: 3, h: 3 },
  watchlist: { w: 3, h: 3 },
  note: { w: 3, h: 3 },
  todo: { w: 3, h: 2 },
  tools: { w: 3, h: 2 },
  links: { w: 3, h: 2 },
  hotlist: { w: 9, h: 2 },
  bidding: { w: 9, h: 3 },
  worldclock: { w: 3, h: 2 },
}

function defaultShowTitle(): Record<CardId, boolean> {
  return DEFAULT_ORDER.reduce((acc, id) => {
    acc[id] = true
    return acc
  }, {} as Record<CardId, boolean>)
}

/** 组件自动高度默认值：仅实时热搜默认开启（满宽卡片），其余（含招标信息）默认按网格展示 */
function defaultAutoHeight(): Record<CardId, boolean> {
  const m = {} as Record<CardId, boolean>
  for (const id of DEFAULT_ORDER) m[id] = id === 'hotlist'
  return m
}

function defaultPrefs(): WbPrefs {
  return {
    showTitle: defaultShowTitle(),
    autoHeight: defaultAutoHeight(),
    calendar: { showLunar: true, rowGap: 2, colGap: 2, autoFill: false },
    countdown: {
      targets: [{ id: uid(), label: '距离下班', kind: 'daily', value: '18:00' }],
    },
    daycount: {
      events: [],
      lineGap: 8,
    },
    todo: { defaultCategory: '工作', showCompleted: true, lineGap: 6, fontSize: 14, categories: ['工作', '生活', '其他'], items: [] },
    note: { sortBy: 'updatedAt', lineGap: 8, fontSize: 14, pad: 32, outerPad: 0, closeOnMask: true, items: [] },
    watchlist: { holdings: [], autoRefresh: { ...DEFAULT_WL_AUTOREFRESH } },
    quote: { refreshMinutes: 30 },
    tools: {
      showTitle: true,
      rowGap: DEFAULT_TOOL_GAP,
      colGap: DEFAULT_TOOL_GAP,
      order: [...DEFAULT_TOOL_ORDER],
    },
    weather: { city: '上海', apiKey: '', host: '', auth: 'key', refreshMode: 'interval', refreshInterval: 360, refreshTimes: ['08:00'] },
    bidding: {
      autoFetch: false,
      fetchInterval: 480,
      sources: [
        {
          id: uid(),
          url: 'https://cgjy.tobacco.com.cn/',
          name: '中烟电子采购平台',
          keywords: ['布带', '吸丝带'],
          fetchBody: true,
          searchUrl: 'https://cgjy.tobacco.com.cn/search.jspx?q={kw}',
        },
        {
          id: uid(),
          // 中招公共服务平台：强反爬 SPA（WAF + 易盾 + 加密接口），后端 urllib 直抓 0 命中，
          // 必须走无头浏览器渲染后按 CSS 选择器抽 DOM。首页为通用中招聚合页，默认不按关键词过滤。
          url: 'https://ctbpsp.com/',
          name: '中招公共服务平台（ctbpsp）',
          type: 'browser',
          keywords: [],
          fetchBody: false,
          itemSelector: 'div.left_body',
          titleSelector: 'p.left_body_name',
          summarySelector: 'span.btncas',
          dateRegex: '接收时间[:：]\\s*(\\d{4}-\\d{2}-\\d{2})',
          baseUrl: 'https://ctbpsp.com/',
          maxItems: 30,
          stealth: true,
          channel: 'msedge',
          // 关键词搜索：ctbpsp 首页搜索框 + 「搜索」按钮；配置后按用户关键词驱动搜索而非只抓通用首页
          searchInputSelector: 'input[type="text"]',
          searchButtonSelector: 'button.btns',
          // 全文搜索：ctbpsp 搜索框下方有「搜标题/搜全文」滑动开关（Element UI .el-switch），
          // 默认是「搜标题」ON（aria-checked="true"），点一次切换到「搜全文」OFF；
          // 否则关键词只能匹配标题，错失正文中包含关键词的标讯。
          searchFullTextToggleSelector: '.el-switch.switchStyle',
          // 搜索触发方式：ctbpsp 在点「搜索」按钮时会拉起易盾滑块验证并 disable 按钮，
          // 真正的 searchkeyword 请求由组件方法 getlist() 发起，故直调组件方法绕开风控。
          searchInvoke: 'vue',
          vueMethod: 'getlist',
          // 有头 + 持久化 profile：headless 指纹会被风控识别，搜索必弹验证
          headful: true,
          // 信任站点全文搜索结果：不再按标题二次过滤，保留正文命中的标讯
          trustSiteSearch: true,
        },
      ],
    },
    links: {
      items: [
        { id: uid(), title: 'GitHub', url: 'https://github.com', icon: 'github' },
        { id: uid(), title: 'WorkBuddy', url: 'https://www.workbuddy.cn', icon: 'sparkles' },
        { id: uid(), title: '邮箱', url: 'https://mail.example.com', icon: 'mail' },
      ],
    },
    hotlist: { ...DEFAULT_HOTLIST },
    worldclock: { ...DEFAULT_WORLDCLOCK },
    translate: { apiKey: '', model: 'deepseek-flash', from: 'zh', to: 'en', tm: true, colors: { accent: '#f59e0b', bg: '', fg: '' }, size: { vw: 40, vh: 60 } },
    exchangeCurrencies: [
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
    ],
  }
}

/**
 * 归一化一份原始状态（来自 localStorage 或服务端）为完整 WbData。
 * - 与 DEFAULT_* 合并，补齐新增卡片 / 缺键，避免旧数据或残缺服务端数据导致 undefined；
 * - 尺寸做范围钳制（w∈[1,GRID_COLS]、h∈[1,5]）；
 * - 招标源用代码默认源补全 searchUrl / fetchBody / name 等结构性参数
 *   （用户若只存 url+keywords，后端会误走普通模式抓首页而 0 命中）。
 * 同时被 load()（本地）与 applyServerState()（账户级）复用，保证两端校验一致。
 */
function _normApiFields(f: any): { title: string; url: string; date: string; summary: string; body: string } {
  f = f && typeof f === 'object' ? f : {}
  return {
    title: typeof f.title === 'string' ? f.title : '',
    url: typeof f.url === 'string' ? f.url : '',
    date: typeof f.date === 'string' ? f.date : '',
    summary: typeof f.summary === 'string' ? f.summary : '',
    body: typeof f.body === 'string' ? f.body : '',
  }
}

function _normSrcType(t: any): 'html' | 'api' | 'rss' | 'browser' {
  return t === 'api' ? 'api' : t === 'rss' ? 'rss' : t === 'browser' ? 'browser' : 'html'
}

/** 间距钳制（px，0~24）；非法值回退默认 */
function _normGap(v: unknown, def: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(24, Math.round(v)))
    : def
}

/** 工具顺序归一化：剔除未知/重复 id，并把新增工具补到末尾（旧 localStorage 平滑升级） */
function _normToolOrder(v: unknown): ToolId[] {
  const all = DEFAULT_TOOL_ORDER as string[]
  const seen = new Set<ToolId>()
  const next: ToolId[] = []
  if (Array.isArray(v)) {
    for (const id of v) {
      if (typeof id === 'string' && all.includes(id) && !seen.has(id as ToolId)) {
        next.push(id as ToolId)
        seen.add(id as ToolId)
      }
    }
  }
  for (const id of DEFAULT_TOOL_ORDER) if (!seen.has(id)) next.push(id)
  return next
}


// 默认实例列表（出厂布局）：从 defaultPrefs 派生每个实例的 config；
// tools 实例额外并入 translate / exchangeCurrencies（翻译与汇率均属工具箱）。
function defaultInstances(): WidgetInstance[] {
  const dp = defaultPrefs()
  const make = (id: CardId, idx: number): WidgetInstance => ({
    iid: `w${idx}_${id}`,
    type: id,
    hidden: false,
    showTitle: true,
    autoHeight: id === 'hotlist',
    size: { ...DEFAULT_SIZES[id] },
    config:
      id === 'tools'
        ? { ...(dp.tools as object), translate: dp.translate, exchangeCurrencies: dp.exchangeCurrencies }
        : ((dp as any)[id] ?? {}),
  })
  return DEFAULT_ORDER.map((id, idx) => make(id, idx))
}

// 归一化单个原始实例（来自服务端 / localStorage 的新格式）
function _normInstance(raw: any): WidgetInstance | null {
  const type = raw?.type
  if (typeof type !== 'string' || !(type in DEFAULT_SIZES)) return null
  const size =
    raw?.size && typeof raw.size.w === 'number' && typeof raw.size.h === 'number'
      ? { w: Math.max(1, Math.min(GRID_COLS, Math.round(raw.size.w))), h: Math.max(1, Math.min(5, Math.round(raw.size.h))) }
      : { ...DEFAULT_SIZES[type] }
  const config = raw?.config && typeof raw.config === 'object' ? { ...raw.config } : {}
  // 工具箱：确保 order 始终包含全部默认工具（如 translate），旧数据缺失时不致丢失
  if (type === 'tools' && Array.isArray((config as Record<string, unknown>).order)) {
    ;(config as Record<string, unknown>).order = _normToolOrder((config as Record<string, unknown>).order)
  }
  return {
    iid: typeof raw?.iid === 'string' && raw.iid ? raw.iid : `w_${type}_${uid()}`,
    type: type as CardId,
    title: typeof raw?.title === 'string' ? raw.title : undefined,
    hidden: !!raw?.hidden,
    showTitle: typeof raw?.showTitle === 'boolean' ? raw.showTitle : true,
    autoHeight: typeof raw?.autoHeight === 'boolean' ? raw.autoHeight : false,
    size,
    config,
  }
}

// 由归一化中间态 base（旧 order/sizes/prefs）转换为实例列表；
// 若原始数据已是新格式（含 instances）则直接采用。
function toWbData(base: LegacyWbData, raw: RawWbState | null | undefined): WbData {
  const rawInst = raw && Array.isArray(raw.instances) ? (raw.instances as unknown[]) : null
  if (rawInst && rawInst.length) {
    const insts = rawInst.map(_normInstance).filter((x): x is WidgetInstance => !!x)
    if (insts.length) {
      return { instances: insts, quote: { refreshMinutes: (base.prefs.quote as { refreshMinutes: number }).refreshMinutes } }
    }
  }
  const instances: WidgetInstance[] = base.order.map((id, idx) => ({
    iid: `w${idx}_${id}`,
    type: id,
    hidden: false,
    showTitle: !!(base.prefs.showTitle && base.prefs.showTitle[id]),
    autoHeight: !!(base.prefs.autoHeight && base.prefs.autoHeight[id]),
    size: base.sizes[id] || DEFAULT_SIZES[id],
    config:
      id === 'tools'
        ? { ...(base.prefs.tools as object), translate: base.prefs.translate, exchangeCurrencies: (base.prefs as any).exchangeCurrencies }
        : ((base.prefs as any)[id] ?? {}),
  }))
  return { instances, quote: { refreshMinutes: (base.prefs.quote as { refreshMinutes: number }).refreshMinutes } }
}

function normalizeState(raw: RawWbState | null | undefined): WbData {
  const base: LegacyWbData = {
    order: [...DEFAULT_ORDER],
    sizes: structuredCloneSafe(DEFAULT_SIZES),
    prefs: defaultPrefs(),
  }
  if (!raw) return toWbData(base, null)
  if (Array.isArray(raw.order)) {
    // 仅保留仍存在的卡片，并补齐新增卡片
    const known = raw.order.filter(
      (id) => typeof id === 'string' && (id as string) in DEFAULT_SIZES,
    ) as CardId[]
    const missing = DEFAULT_ORDER.filter((id) => !known.includes(id))
    base.order = [...known, ...missing]
  }
  if (raw.sizes && typeof raw.sizes === 'object') {
    for (const id of DEFAULT_ORDER) {
      const s = raw.sizes[id]
      if (s && typeof s.w === 'number' && typeof s.h === 'number' && s.w > 0 && s.h > 0)
        base.sizes[id] = {
          w: Math.max(1, Math.min(GRID_COLS, Math.round(s.w))),
          h: Math.max(1, Math.min(5, Math.round(s.h))),
        }
    }
  }
  if (raw.prefs && typeof raw.prefs === 'object') {
    const p = raw.prefs as Record<string, unknown>
    base.prefs = { ...base.prefs, ...(p as unknown as Partial<WbPrefs>) } as WbPrefs
    // 组件自动高度开关：先以默认值兜底，再合并显式 autoHeight；旧数据用 hotlist.adaptiveHeight 迁移。
    const autoH: Record<CardId, boolean> = { ...defaultAutoHeight() }
    // 逐键合并地图类偏好，避免旧数据缺键导致 undefined
    if (p.showTitle && typeof p.showTitle === 'object') {
      base.prefs.showTitle = {
        ...defaultShowTitle(),
        ...(p.showTitle as unknown as Record<CardId, boolean>),
      }
    }
    if (p.links && typeof p.links === 'object') {
      const links = p.links as { items?: unknown }
      base.prefs.links = {
        items: Array.isArray(links.items) ? (links.items as LinkItem[]) : [],
      }
    }
    // 实时热搜：多选平台 / 布局 / 数据源 / 条数 / 自动刷新开关 / 刷新间隔（非法值回落默认）
    if (p.hotlist && typeof p.hotlist === 'object') {
      const h = p.hotlist as {
        platforms?: unknown
        layout?: unknown
        provider?: unknown
        limit?: unknown
        autoRefresh?: unknown
        interval?: unknown
        adaptiveHeight?: unknown
      }
      const validSrcs = HOTLIST_SRCS.map((s) => s.value)
      const validProviders = HOTLIST_PROVIDERS.map((s) => s.value)
      // 多选平台：取数组中与白名单交集，为空则回落默认全平台
      const plats = Array.isArray(h.platforms)
        ? (h.platforms as unknown[]).filter((x) => validSrcs.includes(x as HotlistSource)) as HotlistSource[]
        : []
      base.prefs.hotlist = {
        platforms: plats.length ? plats : [...DEFAULT_HOTLIST.platforms],
        layout: h.layout === 'columns' ? 'columns' : 'tabs',
        provider: validProviders.includes(h.provider as HotlistProvider)
          ? (h.provider as HotlistProvider)
          : DEFAULT_HOTLIST.provider,
        limit:
          typeof h.limit === 'number' && HOTLIST_LIMITS.includes(h.limit)
            ? h.limit
            : DEFAULT_HOTLIST.limit,
        autoRefresh: typeof h.autoRefresh === 'boolean' ? h.autoRefresh : DEFAULT_HOTLIST.autoRefresh,
        interval:
          typeof h.interval === 'number' && HOTLIST_INTERVALS.includes(h.interval)
            ? h.interval
            : DEFAULT_HOTLIST.interval,
        uapisKey: typeof h.uapisKey === 'string' ? h.uapisKey : DEFAULT_HOTLIST.uapisKey,
      }
      // 旧数据兜底：已废弃的 hotlist.adaptiveHeight → autoHeight.hotlist
      if (typeof h.adaptiveHeight === 'boolean') autoH.hotlist = h.adaptiveHeight
    }
    // 每日一言：换新间隔走白名单（旧数据里的非法值回退 30 分钟）
    if (p.quote && typeof p.quote === 'object') {
      const q = p.quote as { refreshMinutes?: unknown }
      base.prefs.quote = {
        refreshMinutes:
          typeof q.refreshMinutes === 'number' && QUOTE_REFRESH_INTERVALS.includes(q.refreshMinutes)
            ? q.refreshMinutes
            : 30,
      }
    }
    // 工具箱：标题显隐 / 行列间距 / 小工具顺序（旧数据 tools 为 {} 时全部回落默认）
    if (p.tools && typeof p.tools === 'object') {
      const t = p.tools as { showTitle?: unknown; rowGap?: unknown; colGap?: unknown; order?: unknown }
      base.prefs.tools = {
        showTitle: typeof t.showTitle === 'boolean' ? t.showTitle : true,
        rowGap: _normGap(t.rowGap, DEFAULT_TOOL_GAP),
        colGap: _normGap(t.colGap, DEFAULT_TOOL_GAP),
        order: _normToolOrder(t.order),
      }
    }
    // 日历：标题显隐 / 行列间距 / 自适应撑满（旧数据 calendar 缺 autoFill 时回落默认 false）
    if (p.calendar && typeof p.calendar === 'object') {
      const c = p.calendar as {
        showLunar?: unknown
        rowGap?: unknown
        colGap?: unknown
        autoFill?: unknown
      }
      base.prefs.calendar = {
        showLunar: typeof c.showLunar === 'boolean' ? c.showLunar : true,
        rowGap: _normGap(c.rowGap, 2),
        colGap: _normGap(c.colGap, 2),
        autoFill: typeof c.autoFill === 'boolean' ? c.autoFill : false,
      }
    }
    // 汇率换算币种列表（旧数据缺该字段时回落默认 10 币种）
    if (Array.isArray(p.exchangeCurrencies)) {
      const list = (p.exchangeCurrencies as unknown[])
        .filter(
          (x): x is { code: string; name: string; symbol: string } =>
            !!x &&
            typeof (x as Record<string, unknown>).code === 'string' &&
            typeof (x as Record<string, unknown>).name === 'string',
        )
        .map((x) => ({
          code: x.code,
          name: x.name,
          symbol: typeof x.symbol === 'string' && x.symbol ? x.symbol : x.code,
        }))
      base.prefs.exchangeCurrencies = list.length ? list : defaultPrefs().exchangeCurrencies
    }
    // 招标：回填自动抓取开关与间隔；并用代码默认源补全结构性抓取参数
    // （searchUrl / fetchBody）——避免用户只存了 url+keywords、漏填搜索模板，导致后端
    // 走普通模式抓首页而 0 命中（如源1 烟草平台首页不含关键词，必须靠 searchUrl）。
    if (p.bidding && typeof p.bidding === 'object') {
      const b = p.bidding as any
      const userSources: any[] = Array.isArray(b.sources) ? b.sources : []
      // 归一化 URL 用于「已知默认源」匹配：去掉 #hash、?query 与尾部斜杠，避免
      // https://ctbpsp.com/#/ 与 https://ctbpsp.com/ 因 hash/斜杠差异而匹配不上官方配方。
      const norm = (u: string) =>
        (u || '').replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase()
      const defByUrl = new Map(
        (defaultPrefs().bidding.sources as any[]).map((d) => [norm(d.url), d]),
      )
      const fixedSources = userSources.map((s: any) => {
        const def = defByUrl.get(norm(s.url))
        // 已知默认源（按 URL 匹配官方配方）：抓取「结构配方」（type / 选择器 / apiUrl 等）以官方为准，
        // 避免用户旧 localStorage 残留的 type:'html' 把反爬站点锁定到失效路径；但**关键词尊重用户自定义**
        // （用户设了布带/吸丝带就按其搜索，未设则回退官方默认），这样 ctbpsp 会用关键词驱动站点搜索框而非只抓通用首页。
        const recipe = def
          ? {
              type: _normSrcType(def.type),
              // 关键词：用户显式设置（含空数组）优先，否则用官方默认
              keywords: Array.isArray(s.keywords)
                ? s.keywords
                : Array.isArray(def.keywords)
                  ? def.keywords
                  : [],
              searchUrl: def.searchUrl || '',
              fetchBody: def.fetchBody !== false,
              apiUrl: def.apiUrl || '',
              itemPath: def.itemPath || '',
              fields: _normApiFields(def.fields),
              // 鉴权凭据是用户私有配置，已知默认源也以用户已存值为准（官方配方不带密钥）
              apiKey: (s as any).apiKey && String((s as any).apiKey).trim() ? String((s as any).apiKey).trim() : '',
              apiHeader:
                (s as any).apiHeader && String((s as any).apiHeader).trim()
                  ? String((s as any).apiHeader).trim()
                  : '',
              itemSelector: def.itemSelector || '',
              titleSelector: def.titleSelector || '',
              linkSelector: def.linkSelector || '',
              summarySelector: def.summarySelector || '',
              dateRegex: def.dateRegex || '',
              baseUrl: def.baseUrl || s.url || '',
              maxItems: def.maxItems || 30,
              stealth: def.stealth !== false,
              channel: def.channel || 'msedge',
              // 浏览器渲染模式：搜索框/按钮选择器（type='browser' 且有关键词时驱动站点搜索）
              searchInputSelector: def.searchInputSelector || '',
              searchButtonSelector: def.searchButtonSelector || '',
              // 全文/标题切换开关选择器（如 Element UI 的 '.el-switch.switchStyle'）
              searchFullTextToggleSelector: def.searchFullTextToggleSelector || '',
              // 以下为浏览器搜索的高级项：默认源由官方配方兜底，但尊重用户已存值
              searchInvoke: (s as any).searchInvoke === 'vue' || (s as any).searchInvoke === 'dom'
                ? (s as any).searchInvoke
                : ((def as any).searchInvoke === 'vue' ? 'vue' : 'dom'),
              vueMethod: (s as any).vueMethod || (def as any).vueMethod || '',
              userDataDir: (s as any).userDataDir || '',
              headful: typeof (s as any).headful === 'boolean' ? (s as any).headful : (def as any).headful !== false,
              trustSiteSearch:
                typeof (s as any).trustSiteSearch === 'boolean'
                  ? (s as any).trustSiteSearch
                  : (def as any).trustSiteSearch !== false,
            }
          : {
              type: _normSrcType(s.type),
              keywords: Array.isArray(s.keywords) ? s.keywords : [],
              searchUrl: s.searchUrl && String(s.searchUrl).trim() ? String(s.searchUrl).trim() : '',
              fetchBody: typeof s.fetchBody === 'boolean' ? s.fetchBody : true,
              apiUrl: s.apiUrl && String(s.apiUrl).trim() ? String(s.apiUrl).trim() : '',
              itemPath: s.itemPath && String(s.itemPath).trim() ? String(s.itemPath).trim() : '',
              fields: _normApiFields(s.fields),
              apiKey: s.apiKey && String(s.apiKey).trim() ? String(s.apiKey).trim() : '',
              apiHeader: s.apiHeader && String(s.apiHeader).trim() ? String(s.apiHeader).trim() : '',
              itemSelector: s.itemSelector && String(s.itemSelector).trim() ? String(s.itemSelector).trim() : '',
              titleSelector: s.titleSelector && String(s.titleSelector).trim() ? String(s.titleSelector).trim() : '',
              linkSelector: s.linkSelector && String(s.linkSelector).trim() ? String(s.linkSelector).trim() : '',
              summarySelector: s.summarySelector && String(s.summarySelector).trim() ? String(s.summarySelector).trim() : '',
              dateRegex: s.dateRegex && String(s.dateRegex).trim() ? String(s.dateRegex).trim() : '',
              baseUrl: s.baseUrl && String(s.baseUrl).trim() ? String(s.baseUrl).trim() : s.url || '',
              maxItems: typeof s.maxItems === 'number' && s.maxItems > 0 ? s.maxItems : 30,
              stealth: typeof s.stealth === 'boolean' ? s.stealth : true,
              channel: s.channel && String(s.channel).trim() ? String(s.channel).trim() : 'msedge',
              searchInvoke: s.searchInvoke === 'vue' ? 'vue' : 'dom',
              vueMethod: s.vueMethod && String(s.vueMethod).trim() ? String(s.vueMethod).trim() : '',
              userDataDir: s.userDataDir && String(s.userDataDir).trim() ? String(s.userDataDir).trim() : '',
              headful: typeof s.headful === 'boolean' ? s.headful : true,
              trustSiteSearch: typeof s.trustSiteSearch === 'boolean' ? s.trustSiteSearch : true,
            }
        return {
          id: typeof s.id === 'number' ? s.id : uid(),
          url: s.url,
          name:
            s.name && String(s.name).trim()
              ? String(s.name).trim()
              : def?.name || '',
          keywords: recipe.keywords,
          searchUrl: recipe.searchUrl,
          fetchBody: recipe.fetchBody,
          type: recipe.type,
          apiUrl: recipe.apiUrl,
          itemPath: recipe.itemPath,
          fields: recipe.fields,
          apiKey: recipe.apiKey,
          apiHeader: recipe.apiHeader,
          itemSelector: recipe.itemSelector,
          titleSelector: recipe.titleSelector,
          linkSelector: recipe.linkSelector,
          summarySelector: recipe.summarySelector,
          dateRegex: recipe.dateRegex,
          baseUrl: recipe.baseUrl,
          maxItems: recipe.maxItems,
          stealth: recipe.stealth,
          channel: recipe.channel,
          searchInputSelector: recipe.searchInputSelector || '',
          searchButtonSelector: recipe.searchButtonSelector || '',
          searchFullTextToggleSelector: recipe.searchFullTextToggleSelector || '',
          searchInvoke: recipe.searchInvoke === 'vue' ? 'vue' : 'dom',
          vueMethod: recipe.vueMethod || '',
          userDataDir: recipe.userDataDir || '',
          headful: recipe.headful !== false,
          trustSiteSearch: recipe.trustSiteSearch !== false,
        }
      })
      const VALID_INTERVALS = [120, 480, 720, 1440, 2880]
      base.prefs.bidding = {
        sources: fixedSources,
        autoFetch: typeof b.autoFetch === 'boolean' ? b.autoFetch : false,
        fetchInterval:
          typeof b.fetchInterval === 'number' && VALID_INTERVALS.includes(b.fetchInterval)
            ? b.fetchInterval
            : 480,
      }
    }
    // 自选股：归一化持仓结构 + 回填开市自动刷新配置（开关 / 间隔白名单）
    if (p.watchlist && typeof p.watchlist === 'object') {
      const wl = p.watchlist as any
      const wlAuto = wl.autoRefresh && typeof wl.autoRefresh === 'object' ? wl.autoRefresh : null
      base.prefs.watchlist = {
        holdings: Array.isArray(wl.holdings)
          ? wl.holdings.map((h: any) => ({
              id: typeof h.id === 'number' ? h.id : uid(),
              code: typeof h.code === 'string' ? h.code : '',
              name: typeof h.name === 'string' ? h.name : undefined,
              buyPrice: typeof h.buyPrice === 'number' ? h.buyPrice : 0,
              shares: typeof h.shares === 'number' ? h.shares : 0,
              prevClose: typeof h.prevClose === 'number' ? h.prevClose : undefined,
              current: typeof h.current === 'number' ? h.current : undefined,
              costDate: typeof h.costDate === 'string' ? h.costDate : undefined,
            }))
          : [],
        autoRefresh: {
          enabled: wlAuto && typeof wlAuto.enabled === 'boolean' ? wlAuto.enabled : DEFAULT_WL_AUTOREFRESH.enabled,
          interval:
            wlAuto &&
            typeof wlAuto.interval === 'number' &&
            WL_AUTOREFRESH_INTERVALS.includes(wlAuto.interval)
              ? wlAuto.interval
              : DEFAULT_WL_AUTOREFRESH.interval,
        },
      }
    }
    // 待办：分类列表（旧数据缺 categories 时回落默认三分类）；逐项校验必填字段
    if (p.todo && typeof p.todo === 'object') {
      const t = p.todo as any
      const def = defaultPrefs().todo
      const cats = Array.isArray(t.categories) && t.categories.length
        ? t.categories.filter((c: unknown) => typeof c === 'string' && c.trim()).map((c: string) => c.trim())
        : [...def.categories]
      const items = Array.isArray(t.items)
        ? t.items
            .filter((x: any) => x && typeof x.text === 'string')
            .map((x: any) => ({
              id: typeof x.id === 'number' ? x.id : uid(),
              text: x.text,
              done: typeof x.done === 'boolean' ? x.done : false,
              category: typeof x.category === 'string' && x.category ? x.category : def.defaultCategory,
              starred: typeof x.starred === 'boolean' ? x.starred : false,
            }))
        : []
      base.prefs.todo = {
        defaultCategory:
          typeof t.defaultCategory === 'string' && t.defaultCategory ? t.defaultCategory : def.defaultCategory,
        showCompleted: typeof t.showCompleted === 'boolean' ? t.showCompleted : true,
        lineGap: _normGap(t.lineGap, 6),
        fontSize: typeof t.fontSize === 'number' && t.fontSize >= 10 ? t.fontSize : 14,
        categories: cats,
        items,
      }
    }
    // 记事：点击遮罩关闭开关（旧数据缺 closeOnMask 时回落默认 true）
    if (p.note && typeof p.note === 'object') {
      const n = p.note as any
      base.prefs.note = {
        ...base.prefs.note,
        sortBy: n.sortBy === 'title' ? 'title' : 'updatedAt',
        lineGap: _normGap(n.lineGap, 8),
        fontSize: typeof n.fontSize === 'number' && n.fontSize >= 10 ? n.fontSize : 14,
        closeOnMask: typeof n.closeOnMask === 'boolean' ? n.closeOnMask : true,
        pad: typeof n.pad === 'number' && n.pad >= 0 ? Math.min(64, n.pad) : 32,
        outerPad: typeof n.outerPad === 'number' && n.outerPad >= 0 ? Math.min(96, n.outerPad) : 0,
        items: Array.isArray(n.items) ? n.items : [],
      }
    }
    // 天气：刷新配置（模式 / 间隔白名单 / 时间点格式校验）
    if (p.weather && typeof p.weather === 'object') {
      const wx = p.weather as any
      const wcfg = base.prefs.weather
      if (typeof wx.city === 'string' && wx.city.trim()) wcfg.city = wx.city.trim()
      if (typeof wx.apiKey === 'string') wcfg.apiKey = wx.apiKey
      if (typeof wx.host === 'string') wcfg.host = wx.host
      if (wx.auth === 'jwt' || wx.auth === 'key') wcfg.auth = wx.auth
      wcfg.refreshMode =
        wx.refreshMode === 'schedule' ? 'schedule' : wx.refreshMode === 'off' ? 'off' : 'interval'
      if (
        typeof wx.refreshInterval === 'number' &&
        WEATHER_REFRESH_INTERVALS.includes(wx.refreshInterval)
      ) {
        wcfg.refreshInterval = wx.refreshInterval
      }
      if (Array.isArray(wx.refreshTimes)) {
        const times = wx.refreshTimes.filter(
          (t: unknown) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t),
        )
        if (times.length) wcfg.refreshTimes = times
      }
    }
    // 世界时间：自定义城市列表（name + IANA timeZone），过滤非法条目、校验时区可用性，兜底默认
    if (p.worldclock && typeof p.worldclock === 'object') {
      const wc = p.worldclock as { cities?: unknown }
      if (Array.isArray(wc.cities)) {
        const cities = normalizeWorldCities(wc.cities)
        base.prefs.worldclock = {
          cities: cities.length ? cities : [...DEFAULT_WORLDCLOCK.cities],
          lineGap: Number.isFinite(wc.lineGap) ? (wc.lineGap as number) : DEFAULT_WORLDCLOCK.lineGap,
        }
      }
    }
    // 翻译：DeepSeek 代理偏好（apiKey 字符串；model 收敛到合法枚举；from/to 收敛到合法语言枚举）
    if (p.translate && typeof p.translate === 'object') {
      const t = p.translate as Record<string, unknown>
      const apiKey = typeof t.apiKey === 'string' ? t.apiKey.trim() : ''
      const MODELS: TranslateModel[] = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro']
      const model = MODELS.includes(t.model as TranslateModel) ? (t.model as TranslateModel) : 'deepseek-flash'
      const LANGS = ['auto', 'zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru']
      const from = typeof t.from === 'string' && LANGS.includes(t.from) ? (t.from as TranslateLang) : 'zh'
      const to = typeof t.to === 'string' && LANGS.includes(t.to) ? (t.to as TranslateLang) : 'en'
      const tm = t.tm === false ? false : true
      // 配色：accent 收敛为合法 hex（默认 #f59e0b），bg/fg 留空则跟随主题
      const c = (t.colors && typeof t.colors === 'object' ? t.colors : {}) as Record<string, unknown>
      const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
      const accent = isHex(c.accent) ? (c.accent as string) : '#f59e0b'
      const bg = isHex(c.bg) ? (c.bg as string) : ''
      const fg = isHex(c.fg) ? (c.fg as string) : ''
      // 弹窗尺寸：vw/vh 收敛为 30–95 的数值，缺省回退 40×60
      const clampPct = (v: unknown, d: number) => {
        const n = typeof v === 'number' && isFinite(v)
          ? v
          : (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d)
        return Math.min(95, Math.max(30, n))
      }
      const s = (t.size && typeof t.size === 'object' ? t.size : {}) as Record<string, unknown>
      const size = { vw: clampPct(s.vw, 40), vh: clampPct(s.vh, 60) }
      base.prefs.translate = { apiKey, model, from, to, tm, colors: { accent, bg, fg }, size }
    }
    // 组件自动高度开关：合并显式 autoHeight（覆盖迁移值）；其余保持默认
    if (p.autoHeight && typeof p.autoHeight === 'object') {
      for (const id of DEFAULT_ORDER) {
        const v = (p.autoHeight as Record<string, unknown>)[id]
        if (typeof v === 'boolean') autoH[id] = v
      }
    }
    base.prefs.autoHeight = autoH
  }
  return toWbData(base, raw)
}

function load(): WbData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeState(JSON.parse(raw) as RawWbState)
  } catch {
    /* 损坏则回退默认 */
  }
  return normalizeState(null)
}

/**
 * 判断当前数据是否含有「用户自定义」内容（区别于出厂默认）。
 * 用于决定「服务端无记录时是否把本地数据迁移上服务端」——
 * 避免空白端口先把默认值写进服务端、污染账户，反过来覆盖真正有数据的端口。
 */
function isLocalNonDefault(d: WbData): boolean {
  const def = defaultInstances()
  if (d.instances.length !== def.length) return true
  for (let i = 0; i < def.length; i++) {
    const a = d.instances[i]
    const b = def[i]
    if (!a || !b) return true
    if (a.type !== b.type) return true
    if (a.hidden !== b.hidden) return true
    if (a.showTitle !== b.showTitle) return true
    if (a.autoHeight !== b.autoHeight) return true
    if (a.size.w !== b.size.w || a.size.h !== b.size.h) return true
    if (JSON.stringify(a.config) !== JSON.stringify(b.config)) return true
  }
  return false
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

export const useWorkbenchStore = defineStore('workbench', () => {
  const data = reactive<WbData>(load())
  const editMode = ref<boolean>(false)
  // 小组件库弹窗开关（工作台视图下由顶栏「组件库」按钮打开；WorkbenchView 内承载 WidgetLibraryModal）
  const widgetLibraryOpen = ref<boolean>(false)

  // —— 账户级持久化（方案2：数据绑定账户，切换端口/设备不丢）——
  // 设计：localStorage 始终作离线缓存；登录态下服务端 workbench_state 为唯一真相源。
  //   - 登录就绪即拉取服务端状态覆盖本地（本地仅作缓存）；
  //   - 本地任何变更防抖（700ms）保存到服务端；
  //   - 服务端无记录且本地确有自定义数据时，把本地迁移上服务端完成绑定。
  const authStore = useAuthStore()
  let applyingServer = false // 应用服务端状态时抑制回写，避免「回声」保存
  let hydrated = false // 每个会话仅 hydrate 一次
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saving = false

  // 深度监听：任何布局 / 偏好 / 数据变动都落盘到 localStorage + 登录态下防抖保存到账户
  watch(
    data,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        /* 忽略写入失败（如隐私模式） */
      }
      scheduleSave()
    },
    { deep: true },
  )

  // —— 翻译草稿 + 翻译记忆（独立 localStorage，避免每次输入重算全量 state）——
  const TRANS_KEY = 'wb_trans_v1'
  const TM_KEY = 'wb_trans_mem_v1'
  const TM_MAX = 300

  interface TranslateMemItem {
    key: string // 归一化源文
    from: TranslateLang
    to: TranslateLang
    dst: string // 译文
    ts: number // 最近使用时间
  }

  function _normText(s: string): string {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  }

  const translateDraft = ref('')
  const translateLast = ref('')
  const transMem = ref<TranslateMemItem[]>([])

  try {
    const t = localStorage.getItem(TRANS_KEY)
    if (t) {
      const o = JSON.parse(t) as { draft?: string; last?: string }
      if (typeof o.draft === 'string') translateDraft.value = o.draft
      if (typeof o.last === 'string') translateLast.value = o.last
    }
  } catch { /* 忽略 */ }
  try {
    const m = localStorage.getItem(TM_KEY)
    if (m) {
      const arr = JSON.parse(m)
      if (Array.isArray(arr)) transMem.value = arr.filter((x) => x && typeof x.key === 'string' && typeof x.dst === 'string').slice(0, TM_MAX)
    }
  } catch { /* 忽略 */ }

  let _transTimer: ReturnType<typeof setTimeout> | null = null
  watch([translateDraft, translateLast], () => {
    if (_transTimer) clearTimeout(_transTimer)
    _transTimer = setTimeout(() => {
      try {
        localStorage.setItem(TRANS_KEY, JSON.stringify({ draft: translateDraft.value, last: translateLast.value }))
      } catch { /* 忽略 */ }
    }, 300)
  })

  function translateConfig(): TranslatePrefs | undefined {
    const inst = data.instances.find((i) => i.type === 'tools')
    return inst ? ((inst.config as any).translate as TranslatePrefs) : undefined
  }
  function _tmEnabled(): boolean {
    const c = translateConfig()
    return !c || c.tm !== false
  }

  function clearTranslate() {
    translateDraft.value = ''
    translateLast.value = ''
  }

  function tmAdd(src: string, from: TranslateLang, to: TranslateLang, dst: string) {
    if (!_tmEnabled()) return
    const key = _normText(src)
    const dstTrim = (dst || '').trim()
    if (!key || !dstTrim) return
    const now = Date.now()
    const revKey = _normText(dstTrim)
    let list = transMem.value.filter((x) => x.key !== key && x.key !== revKey)
    list.push({ key, from, to, dst: dstTrim, ts: now })
    if (revKey && revKey !== key) {
      list.push({ key: revKey, from: to, to: from, dst: (src || '').trim(), ts: now })
    }
    list.sort((a, b) => b.ts - a.ts)
    while (list.length > TM_MAX) list.pop()
    transMem.value = list
    try { localStorage.setItem(TM_KEY, JSON.stringify(transMem.value)) } catch { /* 忽略 */ }
  }

  function tmFind(src: string): TranslateMemItem | null {
    if (!_tmEnabled()) return null
    const key = _normText(src)
    if (!key) return null
    let best: TranslateMemItem | null = null
    for (const x of transMem.value) {
      if (x.key === key && (!best || x.ts > best.ts)) best = x
    }
    return best
  }

  function tmClear() {
    transMem.value = []
    try { localStorage.removeItem(TM_KEY) } catch { /* 忽略 */ }
  }

  function scheduleSave() {
    if (applyingServer) return
    if (!authStore.authed) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveToServer()
    }, 700)
  }

  async function saveToServer() {
    if (!authStore.authed || saving) return
    saving = true
    try {
      await workbenchApi.saveState({
        instances: data.instances,
      })
    } catch {
      /* 失败静默：下次变更再试 */
    } finally {
      saving = false
    }
  }

  // 用服务端状态覆盖本地（normalizeState 复用与本地一致的校验/补全逻辑）
  async function applyServerState(st: WorkbenchStateDTO) {
    const norm = normalizeState(st as unknown as RawWbState)
    // 防御：归一化后无实例（如误收到空 {}）→ 不覆盖本地，避免抹平真实配置
    if (!norm.instances.length) return
    applyingServer = true
    try {
      // 保留本地已抓取的实时行情（现价 / 昨收）：服务端只存持仓结构，按代码回填避免刷新后回到「行情加载中…」
      const quoteByCode = new Map<string, { current?: number; prevClose?: number }>()
      for (const inst of data.instances) {
        if (inst.type === 'watchlist' && Array.isArray((inst.config as any).holdings)) {
          for (const h of (inst.config as any).holdings) {
            if (h.code) quoteByCode.set(h.code, { current: h.current, prevClose: h.prevClose })
          }
        }
      }
      // 按 iid 原地合并：保留已有实例引用（避免卡片依赖脱钩），找不到的实例追加在末尾
      const existing = new Map(data.instances.map((i) => [i.iid, i]))
      const next = norm.instances.map((n) => {
        const ex = existing.get(n.iid)
        if (ex) {
          ex.type = n.type
          ex.hidden = n.hidden
          ex.showTitle = n.showTitle
          ex.autoHeight = n.autoHeight
          ex.size = n.size
          ex.title = n.title
          Object.assign(ex.config, n.config)
          if (ex.type === 'watchlist' && Array.isArray((ex.config as any).holdings)) {
            for (const h of (ex.config as any).holdings) {
              const q = quoteByCode.get(h.code)
              if (q) {
                if (typeof q.current === 'number') h.current = q.current
                if (typeof q.prevClose === 'number') h.prevClose = q.prevClose
              }
            }
          }
          return ex
        }
        return n
      })
      data.instances = next
    } finally {
      // 等本次变更落盘到 localStorage 后再解除抑制，避免紧接着又回写服务端
      await nextTick()
    }
    applyingServer = false
  }

  async function hydrateFromServer() {
    try {
      const res = await workbenchApi.getState()
      const st = res.state
      // 仅当服务端确实携带「实例列表 / 旧 order」才视为有效数据；
      // 空对象 {} 或仅含无关脏字段的状态一律按「无记录」处理，
      // 避免把空状态当真相源灌回本地、将用户真实配置抹平为默认（数据清空事故的根因）。
      const serverHasData = !!(
        st &&
        ((Array.isArray((st as any).instances) && (st as any).instances.length) ||
          (Array.isArray((st as any).order) && (st as any).order.length))
      )
      if (serverHasData) {
        // 服务端已有状态：作为真相源覆盖本地（localStorage 仅作缓存）
        await applyServerState(st as WorkbenchStateDTO)
      } else if (isLocalNonDefault(data)) {
        // 服务端无记录且本地确有自定义数据：迁移上服务端，完成账户绑定
        await saveToServer()
      }
      // 服务端无记录且本地为默认值：不写服务端，保持 server=null，避免污染账户
    } catch {
      // 网络 / 401：维持本地现状，下次变更或重新登录再尝试
    }
  }

  function maybeHydrate() {
    if (hydrated) return
    if (!authStore.authed) return
    hydrated = true
    void hydrateFromServer()
  }

  // 登录态就绪即拉取账户级状态（immediate 覆盖「已登录但 store 晚于 auth 创建」）
  watch(() => authStore.authed, () => maybeHydrate(), { immediate: true })

  // ============== 编辑态 ==============
  function toggleEdit() {
    editMode.value = !editMode.value
  }


  // ============== 实例查询 / 变更 ==============
  function getInst(iid: string): WidgetInstance | undefined {
    return data.instances.find((i) => i.iid === iid)
  }
  function instConfig(iid: string): any {
    const inst = getInst(iid)
    return inst ? inst.config : undefined
  }
  function instancesOfType(type: CardId): WidgetInstance[] {
    return data.instances.filter((i) => i.type === type)
  }
  const visibleInstances = computed(() => data.instances.filter((i) => !i.hidden))

  function defaultInstanceConfig(type: CardId): Record<string, any> {
    const dp = defaultPrefs()
    if (type === 'tools') {
      return { ...(dp.tools as object), translate: dp.translate, exchangeCurrencies: dp.exchangeCurrencies }
    }
    const v = (dp as any)[type]
    return v && typeof v === 'object' ? { ...v } : {}
  }

  // 组件库：新增 / 删除 / 隐藏
  // 同类首个沿用类型名，后续按 "类型名 N" 编号（N = 当前同类数量 + 1），避免 "时钟1/时钟2" 这类数字前缀重复
  function addWidget(type: CardId): string {
    const iid = `w_${type}_${uid()}`
    const n = data.instances.filter((i) => i.type === type).length
    const title = n === 0 ? WIDGET_META[type].name : `${WIDGET_META[type].name} ${n + 1}`
    data.instances.push({
      iid,
      type,
      title,
      hidden: false,
      showTitle: true,
      autoHeight: type === 'hotlist',
      size: { ...DEFAULT_SIZES[type] },
      config: defaultInstanceConfig(type),
    })
    return iid
  }
  function removeWidget(iid: string) {
    data.instances = data.instances.filter((i) => i.iid !== iid)
  }
  function hideWidget(iid: string, hidden: boolean) {
    const inst = getInst(iid)
    if (inst) inst.hidden = hidden
  }
  function setInstanceTitle(iid: string, title: string) {
    const inst = getInst(iid)
    if (inst) inst.title = title || undefined
  }
  function widgetTitle(inst: WidgetInstance): string {
    return inst.title || (WIDGET_META[inst.type]?.name ?? inst.type)
  }

  // 尺寸（按实例）
  function getInstSize(iid: string): CardSize {
    const inst = getInst(iid)
    if (!inst) return DEFAULT_SIZES.time
    return inst.size
  }
  function setInstSize(iid: string, w: number, h: number) {
    const inst = getInst(iid)
    if (!inst) return
    inst.size = {
      w: Math.max(1, Math.min(GRID_COLS, Math.round(w))),
      h: Math.max(1, Math.min(5, Math.round(h))),
    }
  }

  // 标题栏 / 自动高度（按实例）
  function getShowTitle(iid: string): boolean {
    return getInst(iid)?.showTitle !== false
  }
  function setShowTitle(iid: string, v: boolean) {
    const inst = getInst(iid)
    if (inst) inst.showTitle = v
  }
  function getAutoHeight(iid: string): boolean {
    return !!getInst(iid)?.autoHeight
  }
  function setAutoHeight(iid: string, v: boolean) {
    const inst = getInst(iid)
    if (inst) inst.autoHeight = v
  }
  function patchInst(iid: string, patch: Record<string, any>) {
    const inst = getInst(iid)
    if (inst) Object.assign(inst.config, patch)
  }

  function reorderInstances(ids: string[]) {
    const map = new Map(data.instances.map((i) => [i.iid, i]))
    const next: WidgetInstance[] = []
    for (const id of ids) {
      const i = map.get(id)
      if (i) {
        next.push(i)
        map.delete(id)
      }
    }
    for (const i of map.values()) next.push(i)
    data.instances = next
  }

  // 重置为出厂布局（重建默认实例列表）
  function resetLayout() {
    data.instances = defaultInstances()
  }

  // —— 倒计时 ——
  function addCountdownTarget(iid: string, t: Omit<CountdownTarget, 'id'>) {
    (getInst(iid)?.config as any).targets.push({ ...t, id: uid() })
  }
  function removeCountdownTarget(iid: string, id: number) {
    (getInst(iid)?.config as any).targets = (getInst(iid)?.config as any).targets.filter((t) => t.id !== id)
  }

  // —— 倒数日 ——
  function addDayCountEvent(iid: string, ev: Omit<DayCountEvent, 'id'>) {
    const c = getInst(iid)?.config as any
    if (!c) return
    if (!Array.isArray(c.events)) c.events = []
    c.events.push({ ...ev, id: uid() })
  }
  function removeDayCountEvent(iid: string, id: number) {
    const c = getInst(iid)?.config as any
    if (c?.events) c.events = c.events.filter((e: any) => e.id !== id)
  }
  function updateDayCountEvent(iid: string, id: number, patch: Partial<DayCountEvent>) {
    const c = getInst(iid)?.config as any
    const e = c?.events?.find((x: any) => x.id === id)
    if (e) Object.assign(e, patch)
  }
  function reorderDayCountEvents(iid: string, orderedIds: number[]) {
    const c = getInst(iid)?.config as any
    if (!c?.events) return
    const map = new Map<number, any>(c.events.map((e: any) => [e.id, e]))
    const next: any[] = []
    for (const id of orderedIds) {
      const e = map.get(id)
      if (e) {
        next.push(e)
        map.delete(id)
      }
    }
    // 兜底：未被排序覆盖的事件（理论上不应出现）追加在末尾，避免丢失
    for (const e of map.values()) next.push(e)
    c.events = next
  }

  // —— 待办 ——
  function addTodo(iid: string, text: string, category: string) {
    (getInst(iid)?.config as any).items.push({
      id: uid(),
      text: text.trim(),
      done: false,
      category: category || (getInst(iid)?.config as any).defaultCategory,
      starred: false,
    })
  }
  function updateTodo(iid: string, id: number, patch: Partial<TodoItem>) {
    const it = (getInst(iid)?.config as any).items.find((t) => t.id === id)
    if (it) Object.assign(it, patch)
  }
  function removeTodo(iid: string, id: number) {
    (getInst(iid)?.config as any).items = (getInst(iid)?.config as any).items.filter((t) => t.id !== id)
  }

  // 待办分类管理（设置页：新增 / 改名 / 删除 / 拖拽排序）
  function addTodoCategory(iid: string, cat: string) {
    const name = (cat || '').trim()
    if (!name) return
    const cs = (getInst(iid)?.config as any).categories
    if (cs.includes(name)) return
    cs.push(name)
  }
  function updateTodoCategory(iid: string, oldName: string, newName: string) {
    const on = (oldName || '').trim()
    const nn = (newName || '').trim()
    if (!on || !nn || on === nn) return
    const cs = (getInst(iid)?.config as any).categories
    const idx = cs.indexOf(on)
    if (idx === -1) return
    if (cs.includes(nn)) return // 重名则跳过（保留已有位置）
    cs[idx] = nn
    for (const it of (getInst(iid)?.config as any).items) {
      if (it.category === on) it.category = nn
    }
    if ((getInst(iid)?.config as any).defaultCategory === on) (getInst(iid)?.config as any).defaultCategory = nn
  }
  function removeTodoCategory(iid: string, cat: string) {
    const name = (cat || '').trim()
    if (!name) return
    const cs = (getInst(iid)?.config as any).categories
    if (cs.length <= 1) return // 至少保留一个分类
    const idx = cs.indexOf(name)
    if (idx === -1) return
    cs.splice(idx, 1)
    const fallback = cs[0]
    for (const it of (getInst(iid)?.config as any).items) {
      if (it.category === name) it.category = fallback
    }
    if ((getInst(iid)?.config as any).defaultCategory === name) (getInst(iid)?.config as any).defaultCategory = fallback
  }
  function reorderTodoCategory(iid: string, ordered: string[]) {
    const cur = (getInst(iid)?.config as any).categories
    const map = new Map(cur.map((c) => [c, c]))
    const next: string[] = []
    if (Array.isArray(ordered)) {
      for (const c of ordered) {
        if (typeof c === 'string' && c.trim() && map.has(c)) {
          next.push(c)
          map.delete(c)
        }
      }
    }
    for (const c of cur) if (map.has(c)) next.push(c) // 兜底补齐遗漏项
    cur.splice(0, cur.length, ...next)
  }

  // —— 记事 ——
  function addNote(iid: string, title: string, body: string) {
    (getInst(iid)?.config as any).items.push({ id: uid(), title: title.trim(), body, updatedAt: Date.now() })
  }
  function updateNote(iid: string, id: number, patch: Partial<NoteItem>) {
    const it = (getInst(iid)?.config as any).items.find((t) => t.id === id)
    if (it) {
      Object.assign(it, patch)
      it.updatedAt = Date.now()
    }
  }
  function removeNote(iid: string, id: number) {
    (getInst(iid)?.config as any).items = (getInst(iid)?.config as any).items.filter((t) => t.id !== id)
  }
  function restoreNote(iid: string, item: NoteItem) {
    // 撤销删除：按原 id 原样插回（防重复）；sorted 展示顺序由 sortBy 自动还原
    if (!(getInst(iid)?.config as any).items.some((t) => t.id === item.id)) {
      (getInst(iid)?.config as any).items.push({ ...item })
    }
  }

  // —— 自选股持仓 ——
  function addHolding(iid: string, h: Omit<Holding, 'id'>) {
    (getInst(iid)?.config as any).holdings.push({ ...h, id: uid() })
  }
  function updateHolding(iid: string, id: number, patch: Partial<Holding>) {
    const it = (getInst(iid)?.config as any).holdings.find((t) => t.id === id)
    if (it) Object.assign(it, patch)
  }
  function removeHolding(iid: string, id: number) {
    (getInst(iid)?.config as any).holdings = (getInst(iid)?.config as any).holdings.filter((t) => t.id !== id)
  }
  // 拖拽排序：按给定 id 顺序排列持仓
  function reorderHolding(iid: string, orderedIds: number[]) {
    const map = new Map((getInst(iid)?.config as any).holdings.map((h) => [h.id, h]))
    const next: Holding[] = []
    for (const id of orderedIds) {
      const h = map.get(id)
      if (h) {
        next.push(h)
        map.delete(id)
      }
    }
    // 兜底：补全未在顺序中的持仓
    for (const h of map.values()) next.push(h)
    (getInst(iid)?.config as any).holdings = next
  }

  // —— 工具箱小工具排序 ——
  // 注意：必须原地 splice 而非整数组重赋值，避免 ToolsCard 里
  // computed(() => wb.prefs.tools.order) 建立的依赖被替换后脱钩（UI 不动但数据已变）。
  function reorderTools(iid: string, orderedIds: ToolId[]) {
    const next = _normToolOrder(orderedIds)
    const cur = (getInst(iid)?.config as any).order
    cur.splice(0, cur.length, ...next)
  }

  // —— 招标抓取源（支持 html 列表页 / api 明文接口 / rss 订阅源 / browser 无头渲染 四种类型）——
  interface BiddingBrowserOpts {
    itemSelector?: string
    titleSelector?: string
    linkSelector?: string
    summarySelector?: string
    dateRegex?: string
    baseUrl?: string
    maxItems?: number
    stealth?: boolean
    channel?: string
    /** 关键词搜索的输入框选择器（如 'input[type="text"]'）；配置后按每个关键词驱动站点搜索框 */
    searchInputSelector?: string
    /** 提交搜索的按钮选择器（如 'button.btns'）；留空则回车或按文本「搜索」兜底 */
    searchButtonSelector?: string
    /** 「全文/标题」搜索切换开关选择器（如 Element UI 的 '.el-switch.switchStyle'）；
     *  配置后会在关键词搜索开始前确保开关处于「OFF/全文」模式（点一次） */
    searchFullTextToggleSelector?: string
    /** 搜索触发方式：'dom' 点按钮（通用）/ 'vue' 直调页面组件方法。
     *  ctbpsp 点按钮会拉起易盾滑块并禁用按钮，必须走 'vue' */
    searchInvoke?: 'dom' | 'vue'
    /** searchInvoke='vue' 时调用的组件方法名，默认 'getlist' */
    vueMethod?: string
    /** 持久化 profile 目录（复用 cookie 降低风控命中）；留空由后端指定 */
    userDataDir?: string
    /** 有头模式：ctbpsp 对无头指纹敏感，无头下搜索必弹人机验证 */
    headful?: boolean
    /** 信任站点全文搜索结果（保留正文命中项），默认 true */
    trustSiteSearch?: boolean
  }

  /** 招标 API 源鉴权（type='api' 的明文 JSON 接口需要携带令牌时填写） */
  interface BiddingApiAuth {
    /** API Key / 令牌值（如和风商业版、各类 SaaS 标讯接口申请的 token） */
    apiKey?: string
    /** 自定义请求头名（留空默认 Authorization: Bearer <apiKey>）。
     *  部分接口用 X-API-Key / apikey 等头名；填了即按「头名: 值」原样发送。 */
    apiHeader?: string
  }
  function addBiddingSource(iid: string, 
    url: string,
    keywords: string[],
    fetchBody = true,
    searchUrl = '',
    name = '',
    type: 'html' | 'api' | 'rss' | 'browser' = 'html',
    apiUrl = '',
    itemPath = '',
    fields: { title?: string; url?: string; date?: string; summary?: string; body?: string } = {},
    browser: BiddingBrowserOpts = {},
    apiAuth: BiddingApiAuth = {},
  ) {
    const u = url.trim()
    (getInst(iid)?.config as any).sources.push({
      id: uid(),
      url: u,
      name: name.trim(),
      keywords,
      fetchBody,
      searchUrl: searchUrl.trim(),
      type: _normSrcType(type),
      apiUrl: apiUrl.trim(),
      itemPath: itemPath.trim(),
      fields: _normApiFields(fields),
      apiKey: apiAuth.apiKey?.trim() || '',
      apiHeader: apiAuth.apiHeader?.trim() || '',
      // 浏览器渲染模式字段（仅 type='browser' 时后端使用；其它模式留空不干扰）
      itemSelector: browser.itemSelector?.trim() || '',
      titleSelector: browser.titleSelector?.trim() || '',
      linkSelector: browser.linkSelector?.trim() || '',
      summarySelector: browser.summarySelector?.trim() || '',
      dateRegex: browser.dateRegex?.trim() || '',
      baseUrl: browser.baseUrl?.trim() || u || '',
      maxItems: browser.maxItems && browser.maxItems > 0 ? browser.maxItems : 30,
      stealth: browser.stealth !== false,
      channel: browser.channel?.trim() || 'msedge',
      searchInputSelector: browser.searchInputSelector?.trim() || '',
      searchButtonSelector: browser.searchButtonSelector?.trim() || '',
      searchFullTextToggleSelector: browser.searchFullTextToggleSelector?.trim() || '',
      searchInvoke: browser.searchInvoke === 'vue' ? 'vue' : 'dom',
      vueMethod: browser.vueMethod?.trim() || '',
      userDataDir: browser.userDataDir?.trim() || '',
      headful: browser.headful !== false,
      trustSiteSearch: browser.trustSiteSearch !== false,
    })
  }
  function updateBiddingSource(iid: string, 
    id: number,
    url: string,
    keywords: string[],
    fetchBody?: boolean,
    searchUrl?: string,
    name?: string,
    type?: 'html' | 'api' | 'rss' | 'browser',
    apiUrl?: string,
    itemPath?: string,
    fields?: { title?: string; url?: string; date?: string; summary?: string; body?: string },
    browser?: BiddingBrowserOpts,
    apiAuth?: BiddingApiAuth,
  ) {
    const it = (getInst(iid)?.config as any).sources.find((s) => s.id === id)
    if (it) {
      it.url = url.trim()
      it.keywords = keywords
      if (typeof name === 'string') it.name = name.trim()
      if (typeof fetchBody === 'boolean') it.fetchBody = fetchBody
      if (typeof searchUrl === 'string') it.searchUrl = searchUrl.trim()
      if (typeof type === 'string') it.type = _normSrcType(type)
      if (typeof apiUrl === 'string') it.apiUrl = apiUrl.trim()
      if (typeof itemPath === 'string') it.itemPath = itemPath.trim()
      if (fields && typeof fields === 'object') it.fields = _normApiFields(fields)
      if (apiAuth && typeof apiAuth === 'object') {
        if (typeof apiAuth.apiKey === 'string') it.apiKey = apiAuth.apiKey.trim()
        if (typeof apiAuth.apiHeader === 'string') it.apiHeader = apiAuth.apiHeader.trim()
      }
      if (browser && typeof browser === 'object') {
        if (typeof browser.itemSelector === 'string') it.itemSelector = browser.itemSelector.trim()
        if (typeof browser.titleSelector === 'string') it.titleSelector = browser.titleSelector.trim()
        if (typeof browser.linkSelector === 'string') it.linkSelector = browser.linkSelector.trim()
        if (typeof browser.summarySelector === 'string') it.summarySelector = browser.summarySelector.trim()
        if (typeof browser.dateRegex === 'string') it.dateRegex = browser.dateRegex.trim()
        if (typeof browser.baseUrl === 'string') it.baseUrl = browser.baseUrl.trim()
        if (typeof browser.maxItems === 'number') it.maxItems = browser.maxItems
        if (typeof browser.stealth === 'boolean') it.stealth = browser.stealth
        if (typeof browser.channel === 'string') it.channel = browser.channel.trim()
        if (typeof browser.searchInputSelector === 'string') it.searchInputSelector = browser.searchInputSelector.trim()
        if (typeof browser.searchButtonSelector === 'string') it.searchButtonSelector = browser.searchButtonSelector.trim()
        if (typeof browser.searchFullTextToggleSelector === 'string') it.searchFullTextToggleSelector = browser.searchFullTextToggleSelector.trim()
        if (browser.searchInvoke === 'vue' || browser.searchInvoke === 'dom') it.searchInvoke = browser.searchInvoke
        if (typeof browser.vueMethod === 'string') it.vueMethod = browser.vueMethod.trim()
        if (typeof browser.userDataDir === 'string') it.userDataDir = browser.userDataDir.trim()
        if (typeof browser.headful === 'boolean') it.headful = browser.headful
        if (typeof browser.trustSiteSearch === 'boolean') it.trustSiteSearch = browser.trustSiteSearch
      }
    }
  }
  function removeBiddingSource(iid: string, id: number) {
    (getInst(iid)?.config as any).sources = (getInst(iid)?.config as any).sources.filter((s) => s.id !== id)
  }

  // —— 常用链接 ——
  function addLink(iid: string, title: string, url: string, icon: string, iconImg?: string) {
    (getInst(iid)?.config as any).items.push({
      id: uid(),
      title: title.trim() || '未命名',
      url: url.trim(),
      icon: icon.trim() || 'link',
      iconImg: iconImg?.trim() || undefined,
    })
  }
  function updateLink(iid: string, 
    id: number,
    patch: Partial<Pick<LinkItem, 'title' | 'url' | 'icon' | 'iconImg'>>,
  ) {
    const it = (getInst(iid)?.config as any).items.find((l) => l.id === id)
    if (!it) return
    if (patch.title !== undefined) it.title = patch.title.trim() || '未命名'
    if (patch.url !== undefined) it.url = patch.url.trim()
    if (patch.icon !== undefined) it.icon = patch.icon.trim() || 'link'
    if (patch.iconImg !== undefined) it.iconImg = patch.iconImg.trim() || undefined
  }
  function removeLink(iid: string, id: number) {
    (getInst(iid)?.config as any).items = (getInst(iid)?.config as any).items.filter((l) => l.id !== id)
  }
  function reorderLink(iid: string, orderedIds: number[]) {
    const map = new Map((getInst(iid)?.config as any).items.map((l) => [l.id, l]))
    const next: LinkItem[] = []
    for (const id of orderedIds) {
      const l = map.get(id)
      if (l) {
        next.push(l)
        map.delete(id)
      }
    }
    for (const l of map.values()) next.push(l)
    (getInst(iid)?.config as any).items = next
  }

  return {
    // 状态
    // 注意：必须用工况 computed 读取 data.instances，而非直接返回快照。
    // data.instances 在 hydrate / removeWidget / reorderInstances / resetLayout 中会被整体重赋值，
    // 若此处返回快照引用，组件读到的 wb.instances 会在首次重赋值后失效（表现为「添加后需刷新才显示」）。
    instances: computed(() => data.instances),
    visibleInstances,
    quote: data.quote,
    editMode,
    widgetLibraryOpen,
    // 实例动作
    getInst,
    instConfig,
    instancesOfType,
    getInstSize,
    setInstSize,
    getShowTitle,
    setShowTitle,
    getAutoHeight,
    setAutoHeight,
    setInstanceTitle,
    patchInst,
    reorderInstances,
    addWidget,
    removeWidget,
    hideWidget,
    widgetTitle,
    resetLayout,
    // 编辑态
    toggleEdit,
    // 倒计时
    addCountdownTarget,
    removeCountdownTarget,
    // 倒数日
    addDayCountEvent,
    removeDayCountEvent,
    updateDayCountEvent,
    reorderDayCountEvents,
    // 待办
    addTodo,
    updateTodo,
    removeTodo,
    addTodoCategory,
    updateTodoCategory,
    removeTodoCategory,
    reorderTodoCategory,
    // 记事
    addNote,
    updateNote,
    removeNote,
    restoreNote,
    // 自选股
    addHolding,
    updateHolding,
    removeHolding,
    reorderHolding,
    // 工具箱
    reorderTools,
    // 招标抓取源
    addBiddingSource,
    updateBiddingSource,
    removeBiddingSource,
    // 常用链接
    addLink,
    updateLink,
    removeLink,
    reorderLink,
    // 常量
    GRID_COLS,
    DEFAULT_ORDER,
    DEFAULT_SIZES,
    DEFAULT_TOOL_ORDER,
    WIDGET_META,
    // 翻译草稿 + 记忆
    translateDraft,
    translateLast,
    clearTranslate,
    transMem,
    tmAdd,
    tmFind,
    tmClear,
  }
})
