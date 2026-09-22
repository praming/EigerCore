// 工作台数据接口
// 真实接口由 Flask 后端 (app/workbench_api.py) 提供，经 /api/* 暴露：
//   GET /api/weather?city=    天气（和风天气；缺密钥时后端兜底占位）
//   GET /api/stock?codes=     自选股实时行情（腾讯财经，免密钥）
//   GET /api/bidding          招标信息（爬虫 + 兜底）
//   GET /api/quote            每日名言（一言）
// 全部 GET、免 CSRF、不强制登录，失败由后端兜底返回 200，前端始终有数据可渲染。

import { apiGet, apiPut } from '@/api/request'

export interface BiddingSource {
  id: number
  url: string
  keywords: string[]
  /** 自定义源名称（卡片展示用，如「中烟电子采购平台」） */
  name?: string
  /** 是否下钻详情页抓取标题/发布时间/正文（默认 true） */
  fetchBody?: boolean
  /** 搜索结果页 URL 模板，含 {kw} 占位符；配置后按每个关键词逐个搜索并合并命中 */
  searchUrl?: string
  /** 源类型：'html'（默认，抓 HTML 列表页/搜索页）、'api'（抓明文 JSON 接口）、'rss'（抓 RSS/Atom 订阅源）或 'browser'（无头浏览器渲染反爬 SPA 后按 CSS 选择器抽 DOM） */
  type?: 'html' | 'api' | 'rss' | 'browser'
  /** JSON 接口模式：接口地址模板，含 {kw} 占位符则按关键词逐个搜索，否则抓全量列表 */
  apiUrl?: string
  /** JSON 接口模式：命中列表在响应 JSON 中的路径（如 'data.list'），留空=根即列表 */
  itemPath?: string
  /** JSON 接口模式：字段映射（标题/链接/日期/摘要/正文 对应的 JSON key，支持点路径如 'proj.title'） */
  fields?: {
    title?: string
    url?: string
    date?: string
    summary?: string
    body?: string
  }
  /** JSON 接口模式：鉴权令牌（type='api' 且接口需要携带 Key/Token 时填写，如申请的 SaaS 标讯 API） */
  apiKey?: string
  /** JSON 接口模式：自定义请求头名（留空默认 Authorization: Bearer <apiKey>；部分接口用 X-API-Key 等） */
  apiHeader?: string
  /** 浏览器渲染模式（type='browser'）：加载并过 WAF 的页面地址（即 warmupUrl，通常用 url 字段） */
  warmupUrl?: string
  /** 浏览器渲染模式：每个列表项的容器 CSS 选择器（如 'div.left_body'） */
  itemSelector?: string
  /** 浏览器渲染模式：项内标题 CSS 选择器（如 'p.left_body_name'） */
  titleSelector?: string
  /** 浏览器渲染模式：项内链接 CSS 选择器（可选；缺省用 baseUrl，反爬 SPA 常无 <a href>） */
  linkSelector?: string
  /** 浏览器渲染模式：项内摘要 CSS 选择器（可选；多元素用 · 连接，如 'span.btncas'） */
  summarySelector?: string
  /** 浏览器渲染模式：从项文本提取日期的正则（含捕获组，如 '接收时间[:：]\\s*(\\d{4}-\\d{2}-\\d{2})'） */
  dateRegex?: string
  /** 浏览器渲染模式：链接兜底 / 相对链接补全用的站点基址（如 'https://ctbpsp.com/'） */
  baseUrl?: string
  /** 浏览器渲染模式：最多返回条数，默认 30 */
  maxItems?: number
  /** 浏览器渲染模式：是否隐藏 navigator.webdriver（stealth 绕过反爬检测），默认 true */
  stealth?: boolean
  /** 浏览器渲染模式：浏览器通道，默认 'msedge'（系统 Edge） */
  channel?: string
  /** 浏览器渲染模式：关键词搜索的输入框 CSS 选择器（如 'input[type="text"]'）；配置后按每个关键词驱动站点搜索框并提交 */
  searchInputSelector?: string
  /** 浏览器渲染模式：提交搜索的按钮 CSS 选择器（如 'button.btns'）；留空则回车提交或按按钮文本「搜索」兜底 */
  searchButtonSelector?: string
  /** 浏览器渲染模式：「全文/标题」搜索切换开关的 CSS 选择器（如 Element UI 的 '.el-switch.switchStyle'）。
   *  配置后会在关键词搜索开始前确保开关处于「OFF/全文」模式：检测 aria-checked="true"（搜标题）则点击一次并等待重渲。
   *  典型应用：ctbpsp 搜索框下方的「搜标题/搜全文」滑动开关。 */
  searchFullTextToggleSelector?: string
  /** 浏览器渲染模式：搜索触发方式 —— 'dom'=模拟输入+点按钮（通用）；
   *  'vue'=直接调用页面 Vue 组件方法发起搜索。
   *  ctbpsp 在按钮 click 时会拉起易盾滑块并 disable 按钮、导致搜索请求根本不发，必须走 'vue'。 */
  searchInvoke?: 'dom' | 'vue'
  /** searchInvoke='vue' 时调用的组件方法名，默认 'getlist' */
  vueMethod?: string
  /** 浏览器渲染模式：持久化 profile 目录（复用 cookie 降低风控命中）。留空由后端指定默认目录 */
  userDataDir?: string
  /** 浏览器渲染模式：是否用有头浏览器。ctbpsp 对 headless 指纹敏感，无头下搜索必弹人机验证，默认 true */
  headful?: boolean
  /** 是否信任站点自身的全文搜索结果（默认 true）。
   *  true = 不再按「标题+摘要」二次过滤，保留正文命中的标讯（标题可能不含关键词）；
   *  false = 严格按标题/摘要过滤，噪声更少但会漏掉正文命中项。 */
  trustSiteSearch?: boolean
}

export interface BiddingHit {
  id: number
  title: string
  source: string
  /** 自定义源名称（优先于 source 展示） */
  sourceName?: string
  /** 数据源站点地址（后端按 sourceUrl 记录，用于前端按源分组） */
  sourceUrl?: string
  url: string
  publishedAt: string
  summary: string
  budget?: string
  deadline?: string
  keywords: string[]
  /** 详情页正文（下钻抓取得到） */
  body?: string
  /** 正文是否成功抓取：true=成功，false=失败（标记为「正文不可获取」），null/undefined=未下钻 */
  bodyAvailable?: boolean | null
  /** 关键词是否命中在标题：false 表示命中在正文（站点全文搜索结果），前端标注「正文命中」 */
  titleHit?: boolean
}

/** 单个招标抓取源的上一次抓取状态（供前端提示「为何没抓到新数据」） */
export interface BiddingSourceStatus {
  name: string
  ok: boolean
  /** ok=false 时的失败原因（后端截断到 200 字） */
  error?: string
  /** ok=true 时的命中条数 */
  count?: number
}

/** /api/bidding 返回结构 */
export interface BiddingResponse {
  items: BiddingHit[]
  fetchedAt: string | null
  /** 各源最近一次抓取状态；空数组表示未触发抓取（读库） */
  statuses: BiddingSourceStatus[]
}

export interface WeatherInfo {
  city: string
  temp: number
  condition: string
  high: number
  low: number
  forecast: { day: string; cond: string; high: number; low: number }[]
  /** 当日详情扩展字段（图标/温感/湿度/风向风力/能见度/气压）；占位或无 Key 时由后端兜底 */
  now?: {
    icon?: string
    feels: number
    humidity: number
    windDir: string
    windScale: string
    vis: string
    pressure: string
  } | null
  /** 24 小时预报（逐小时温度 + 图标/文字/风向风力），用于折线图；失败/无数据时为空数组 */
  hourly?: {
    time: string
    temp: number
    icon?: string
    text?: string
    windDir?: string
    windScale?: string
  }[]
  /** 7 天预报（用于折线图 + 列表），失败/无数据时为空数组 */
  daily7?: {
    day: string
    date: string
    cond: string
    high: number
    low: number
    icon?: string
    windDir?: string
    windScale?: string
  }[]
  /** 日出 / 日落（HH:MM），来自和风天文接口；失败/无数据时为空字符串 */
  sunrise?: string
  sunset?: string
  source?: string
  /** 获取失败时的错误信息（如 Key 被和风拒绝 403 Invalid Host）；存在时前端展示错误条而非渲染天气 */
  error?: string | null
}

/** 历史日出日落单日记录（Open-Meteo 档案） */
export interface SunDay {
  date: string // YYYY-MM-DD
  sunrise: string // HH:MM（本地时区，空字符串=无数据）
  sunset: string // HH:MM
}

/**
 * 和风天气图标代码（如 "101" / "101d" / "101n"）→ lucide 图标名。
 * 用于天气详情折线图节点、当日天气图标等。未知代码回退 cloud。
 */
export function qweatherIconToLucide(code?: string): string {
  if (!code) return 'cloud'
  const base = code.replace(/[dn]$/i, '') // 去昼夜后缀
  const MAP: Record<string, string> = {
    '100': 'sun',
    '101': 'cloud-sun',
    '102': 'cloud-sun',
    '103': 'cloud-sun',
    '104': 'cloud',
    '150': 'moon',
    '151': 'cloud-moon',
    '152': 'cloud-moon',
    '153': 'cloud-moon',
    '154': 'cloud',
    '300': 'cloud-rain',
    '301': 'cloud-rain',
    '305': 'cloud-rain',
    '306': 'cloud-rain',
    '307': 'cloud-rain',
    '308': 'cloud-rain',
    '309': 'cloud-drizzle',
    '310': 'cloud-rain',
    '311': 'cloud-rain',
    '312': 'cloud-rain',
    '313': 'cloud-rain',
    '314': 'cloud-rain',
    '315': 'cloud-rain',
    '316': 'cloud-rain',
    '317': 'cloud-rain',
    '318': 'cloud-rain',
    '399': 'cloud-rain',
    '400': 'cloud-snow',
    '401': 'cloud-snow',
    '402': 'cloud-snow',
    '403': 'cloud-snow',
    '404': 'cloud-snow',
    '405': 'cloud-snow',
    '406': 'cloud-snow',
    '407': 'cloud-snow',
    '408': 'cloud-snow',
    '409': 'cloud-snow',
    '410': 'cloud-snow',
    '456': 'cloud-snow',
    '457': 'cloud-snow',
    '499': 'cloud-snow',
    '500': 'cloud-fog',
    '501': 'cloud-fog',
    '502': 'cloud-fog',
    '503': 'cloud-fog',
    '504': 'cloud-fog',
    '507': 'cloud-fog',
    '508': 'cloud-fog',
    '509': 'cloud-fog',
    '510': 'cloud-fog',
    '514': 'cloud-fog',
    '515': 'cloud-fog',
    '529': 'cloud-fog',
    '530': 'cloud-fog',
    '531': 'cloud-fog',
    '900': 'cloud-lightning',
    '901': 'cloud-lightning',
    '902': 'cloud-snow',
  }
  return MAP[base] || 'cloud'
}

export interface MarketItem {
  code: string
  name: string
  price: number
  changePct: number
  prevClose: number
}

/** 新股申购标的（来自东方财富新股申购日历） */
export interface IpoItem {
  code: string
  applyCode: string
  name: string
  price: string | number
  /** 申购（打新）日期 YYYY-MM-DD */
  applyDate: string
  /** 缴款日 YYYY-MM-DD */
  payDate: string
  /** 上市日期 YYYY-MM-DD */
  listDate: string
}

export type HotlistSource = 'weibo' | 'zhihu' | 'baidu' | 'bili' | 'douyin' | 'toutiao' | 'tieba' | '36kr' | 'ithome' | 'juejin' | 'csdn' | 'sspai' | 'v2ex' | 'acfun' | 'kuaishou' | 'hupu' | 'thepaper' | 'sina' | 'huxiu' | 'history'
/** 热搜数据源：auto=优先 apizero 失败/串台回退 uapis；apizero/uapis=仅用指定源 */
export type HotlistProvider = 'auto' | 'apizero' | 'uapis'

export interface HotlistItem {
  rank: number
  title: string
  url: string
  /** 热度文案（如「123万」「456789」），可能为 ''(前端按有无决定是否展示) */
  heat: string
  /** 角标（如「热」「新」「沸」），可能没有 */
  label: string
}

export interface HotlistResp {
  items: HotlistItem[]
  /** 上游数据更新时间（字符串，可能为空） */
  updatedAt: string
  /** 数据来源标记：apizero / uapis / error（前端据此决定展示或兜底） */
  source: 'apizero' | 'uapis' | 'error'
  /** source==='error' 时附带的可读提示 */
  message?: string
  /** 为 true 表示这是「上次成功」的兜底缓存（上游当前不可用），前端应提示数据可能已过时 */
  stale?: boolean
  /** 后端真实抓取数据的时刻（epoch 秒）；命中缓存时即上次回源时刻，用于展示「更新于」真实时间 */
  fetchedAt?: number
}

export interface BookmarkItem {
  id: number
  title: string
  url: string
  icon?: string
}

/**
 * 工作台账户级状态 DTO —— 对应后端 WorkbenchState.state 的 JSON 结构。
 * 由服务端按用户持久化（绑定账户），字段以 instances 为核心，
 * 与前端 store 的 WidgetInstance[] 一一对应（每个实例含 type/config/尺寸/显隐等）。
 * quote 为可选全局字段（一言换新间隔），其余实例级数据全部收敛进 instances[].config。
 * 类型刻意放宽（instances 为 unknown[]），因为服务端是 JSON 透传存储，
 * 归一化 / 类型收紧交给前端 store 的 normalizeState 统一处理。
 */
export interface WorkbenchStateDTO {
  instances?: unknown[]
  quote?: { refreshMinutes?: number }
}

export const workbenchApi = {
  // 天气
  weather: (
    city = '上海',
    apiKey = '',
    host = '',
    refresh = false,
    auth: 'key' | 'jwt' = 'key',
  ): Promise<WeatherInfo> => {
    const config: Record<string, unknown> = {}
    const headers: Record<string, string> = {}
    if (apiKey && apiKey.trim()) headers['X-QWeather-Key'] = apiKey.trim()
    if (host && host.trim()) headers['X-QWeather-Host'] = host.trim()
    if (auth === 'jwt') headers['X-QWeather-Auth'] = 'jwt'
    if (Object.keys(headers).length) config.headers = headers
    const q = `/api/weather?city=${encodeURIComponent(city)}` + (refresh ? '&refresh=1' : '')
    return apiGet<WeatherInfo>(q, config as any)
  },

  // 历史日出日落（Open-Meteo 档案，免密钥）
  sunHistory: (city = '上海', start = '', end = ''): Promise<SunDay[]> => {
    const q = `/api/sun-history?city=${encodeURIComponent(city)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    return apiGet<{ days?: SunDay[]; source?: string; error?: string }>(q).then((r) => r.days || [])
  },

  // 招标信息（sources=用户配置的抓取源；refresh=true 时跳过后端缓存强制重抓）
  // 返回 items（命中列表）+ fetchedAt（真实抓取/入库时间 YYYY-MM-DD HH:mm，非页面刷新时刻）
  biddingHits: (
    sources: BiddingSource[] = [],
    refresh = false,
  ): Promise<BiddingResponse> => {
    const params = new URLSearchParams()
    if (sources.length) {
      params.set(
        'sources',
        JSON.stringify(
          sources.map((s) => ({
            url: s.url,
            keywords: s.keywords,
            name: s.name || '', // 自定义源名称（卡片展示 + 入库记录）
            fetchBody: s.fetchBody !== false, // 默认开启详情页抓取
            searchUrl: s.searchUrl || '', // 搜索结果页模板（含 {kw}）；为空则直接抓 url
            type: s.type === 'browser' ? 'browser' : s.type === 'rss' ? 'rss' : s.type === 'api' ? 'api' : 'html', // 源类型：html 列表页 / api 明文接口 / rss 订阅源 / browser 无头渲染
            apiUrl: s.apiUrl || '', // JSON 接口模板（含 {kw}）；api 模式必填
            itemPath: s.itemPath || '', // 命中列表路径（如 'data.list'）；留空=根即列表
            fields: s.fields || {}, // 字段映射（title/url/date/summary/body）
            // JSON 接口鉴权（type='api' 且接口需携带 Key/Token）
            apiKey: s.type === 'api' ? s.apiKey || '' : '',
            apiHeader: s.type === 'api' ? s.apiHeader || '' : '',
            // 浏览器渲染模式字段（type='browser' 时后端驱动无头 Edge 渲染后按选择器抽 DOM）
            warmupUrl: s.warmupUrl || s.url || '',
            itemSelector: s.itemSelector || '',
            titleSelector: s.titleSelector || '',
            linkSelector: s.linkSelector || '',
            summarySelector: s.summarySelector || '',
            dateRegex: s.dateRegex || '',
            baseUrl: s.baseUrl || s.url || '',
            maxItems: s.maxItems || 30,
            stealth: s.stealth !== false,
            channel: s.channel || 'msedge',
            // 浏览器渲染模式：关键词搜索选择器（type='browser' 且有关键词时驱动站点搜索框）
            searchInputSelector: s.searchInputSelector || '',
            searchButtonSelector: s.searchButtonSelector || '',
            // 全文/标题切换开关选择器（ctbpsp 等 Element UI 站点的「搜全文」开关）
            searchFullTextToggleSelector: s.searchFullTextToggleSelector || '',
            // 搜索触发方式：dom=点按钮（通用）/ vue=直调组件方法（ctbpsp 必用，避开易盾滑块）
            searchInvoke: s.searchInvoke === 'vue' ? 'vue' : 'dom',
            vueMethod: s.vueMethod || '',
            userDataDir: s.userDataDir || '',
            // 有头模式：ctbpsp 对无头指纹敏感，默认开启
            headful: s.headful !== false,
            // 信任站点全文搜索结果（不再按标题二次过滤，保留正文命中项）
            trustSiteSearch: s.trustSiteSearch !== false,
          })),
        ),
      )
    }
    if (refresh) params.set('refresh', '1')
    const qs = params.toString()
    return apiGet<BiddingResponse>(`/api/bidding${qs ? '?' + qs : ''}`)
  },

  // 自选股实时行情（codes 形如 ['sh600519','sz300750']）
  market: (codes: string[]): Promise<MarketItem[]> =>
    apiGet<MarketItem[]>(`/api/stock?codes=${codes.map(encodeURIComponent).join(',')}`),

  // 新股申购日历（今日可申购 / 未来一周可申购 / 全部待申购）
  ipo: (): Promise<{ today: IpoItem[]; week: IpoItem[]; all: IpoItem[]; error?: string }> =>
    apiGet<{ today: IpoItem[]; week: IpoItem[]; all: IpoItem[]; error?: string }>('/api/ipo'),

  // 实时热搜榜单（后端代理 apizero / uapis 可切换，缓存跟随 interval；免密钥，填 uapisKey 走会员通道）
  // src 平台白名单见 HOTLIST_SRCS（value 即 uapis type）；limit 1~50；provider=auto|apizero|uapis
  hotlist: (
    src: HotlistSource = 'weibo',
    limit = 20,
    provider: HotlistProvider = 'auto',
    /** 刷新间隔（秒）：透传给后端作为缓存 TTL，间隔内只读缓存、不重复打上游 */
    interval = 60,
    /** uapis 会员 API Key（Bearer）；提供时后端以 Authorization 头走会员通道，缺失则用访客额度 */
    uapisKey?: string,
  ): Promise<HotlistResp> =>
    apiGet<HotlistResp>(
      `/api/hotlist?src=${src}&limit=${limit}&provider=${provider}&interval=${interval}` +
        (uapisKey ? `&ukey=${encodeURIComponent(uapisKey)}` : ''),
    ),

  // 快捷书签：沿用本地占位（LinksCard 现读 store 本地数据）
  bookmarks: (): Promise<BookmarkItem[]> => Promise.resolve([]),

  // —— 账户级工作台状态（绑定用户，跨端口 / 跨设备共享）——
  // 读取当前用户的持久化状态；未登录返回 401，无记录时 state=null。
  getState: (): Promise<{ state: WorkbenchStateDTO | null }> =>
    apiGet<{ state: WorkbenchStateDTO | null }>('/api/workbench/state'),
  // 保存当前用户的持久化状态（PUT，受全局 CSRF 保护；前端拦截器自动带 X-CSRF-Token）。
  saveState: (
    state: WorkbenchStateDTO,
  ): Promise<{ state: WorkbenchStateDTO; updated_at: string }> =>
    apiPut<{ state: WorkbenchStateDTO; updated_at: string }>('/api/workbench/state', { state }),
}
