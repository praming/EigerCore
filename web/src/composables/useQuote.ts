import { onMounted, onUnmounted, ref, watch } from 'vue'

export interface Quote {
  text: string
  author: string
}

// 占位名言库：远程接口不可用时的兜底（见 fetchQuote）
const QUOTES: Quote[] = [
  { text: '千里之行，始于足下。', author: '老子' },
  { text: '不积跬步，无以至千里。', author: '荀子' },
  { text: '志不强者智不达。', author: '墨子' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈' },
  { text: '凡事预则立，不预则废。', author: '《礼记》' },
  { text: '知之者不如好之者，好之者不如乐之者。', author: '孔子' },
  { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
  { text: '博学之，审问之，慎思之，明辨之，笃行之。', author: '《中庸》' },
  { text: '一万年太久，只争朝夕。', author: '毛泽东' },
  { text: '时间就像海绵里的水，只要愿挤，总还是有的。', author: '鲁迅' },
  { text: '我们都是阴沟里的虫子，但总还是得有人仰望星空。', author: '王尔德' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
]

function dateKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// 字符串哈希 → 当天稳定的索引（首次无缓存时的即时占位，避免空白闪烁）
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 上一次展示的名言缓存（跨页面刷新保持）。
 * 独立于 workbench prefs 存放：这是「设备级瞬时状态」而非用户偏好，
 * 放进 prefs 会让每次换句都触发服务端状态回写、并被多端同步互相覆盖。
 */
const CACHE_KEY = 'wb_quote_v1'
interface QuoteCache {
  text: string
  author: string
  at: number // 上次换句的时间戳（ms）
}

function readCache(): QuoteCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<QuoteCache>
    if (typeof c.text === 'string' && c.text && typeof c.at === 'number' && c.at > 0) {
      return { text: c.text, author: typeof c.author === 'string' ? c.author : '佚名', at: c.at }
    }
  } catch {
    /* 损坏则视为无缓存 */
  }
  return null
}

function writeCache(q: Quote, at: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ text: q.text, author: q.author, at }))
  } catch {
    /* 隐私模式等写入失败时忽略：本次会话内仍按内存状态工作 */
  }
}

/**
 * 每日一言。
 *
 * 换新策略（严格按间隔，不再「每次打开页面就随机」）：
 * - 有缓存且未到间隔 → 直接沿用上一次的名言，不发请求；
 * - 无缓存（首次使用） → 拉取一条并记录时间戳；
 * - 已过间隔 → 拉取新的一条并刷新时间戳；
 * - 间隔=0（关闭） → 永不自动换新，只有点「换一句」才换。
 *
 * @param refreshMinutes 取当前换新间隔（分钟，0=关闭）
 */
export function useQuote(refreshMinutes: () => number = () => 0) {
  const cached = readCache()
  const dailyIndex = hashStr(dateKey()) % QUOTES.length
  // 初值：优先上次缓存；无缓存时用当日固定占位，随后 onMounted 会拉取真实接口
  const quote = ref<Quote>(cached ? { text: cached.text, author: cached.author } : QUOTES[dailyIndex])
  const loading = ref(false)
  const copied = ref(false)
  // 上次换句时间戳（0 = 从未换过）
  const lastAt = ref<number>(cached ? cached.at : 0)

  /** 立即换一句（远程优先，失败回退本地库），并刷新时间戳 + 缓存 */
  async function refreshNow() {
    const next = await fetchQuote()
    quote.value = next
    lastAt.value = Date.now()
    writeCache(next, lastAt.value)
  }

  /** 手动「换一句」：无条件换新，并把计时器基准重置到此刻 */
  async function manualRefresh() {
    if (loading.value) return
    loading.value = true
    try {
      await refreshNow()
    } finally {
      loading.value = false
    }
    schedule()
  }

  // —— 自动换新：按「上次换句时间 + 间隔」对齐，而不是从挂载时刻起算 ——
  let timer: number | undefined
  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  function schedule() {
    clearTimer()
    const m = refreshMinutes()
    if (!(m > 0)) return // 关闭
    const ms = m * 60000
    const elapsed = lastAt.value ? Date.now() - lastAt.value : ms
    const delay = Math.max(0, ms - elapsed)
    timer = window.setTimeout(async () => {
      await refreshNow()
      schedule() // 换完重新按新的时间戳排下一次
    }, delay)
  }

  // 间隔变更（设置页切换）后重排：若按新间隔已过期，delay=0 会立即换一句
  watch(refreshMinutes, () => schedule())
  onUnmounted(clearTimer)

  onMounted(async () => {
    const m = refreshMinutes()
    // 是否需要立刻换新：从未拉过 → 必须拉一次；否则仅在「开启自动换新且已过间隔」时拉
    const due = !lastAt.value || (m > 0 && Date.now() - lastAt.value >= m * 60000)
    if (due) {
      loading.value = true
      try {
        await refreshNow()
      } finally {
        loading.value = false
      }
    }
    schedule()
  })

  // 点击复制：把「“名言” —— 作者」写入剪贴板
  async function copyQuote() {
    const text = `“${quote.value.text}” —— ${quote.value.author}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 降级方案（非 https / 旧浏览器）
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(ta)
    }
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1200)
  }

  // 接入后端 /api/quote（一言 hitokoto，免密钥；失败回退本地库）
  async function fetchQuote(): Promise<Quote> {
    try {
      const res = await fetch('/api/quote?fresh=1', { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        if (data && data.text) return { text: data.text, author: data.author || '佚名' }
      }
    } catch {
      /* 网络异常，走下方兜底 */
    }
    // 兜底：本地库随机一条（尽量不与当前显示的重复）
    const curText = quote.value?.text
    const pool = QUOTES.filter((q) => q.text !== curText)
    const list = pool.length ? pool : QUOTES
    return list[Math.floor(Math.random() * list.length)]
  }

  return { quote, loading, copied, lastAt, manualRefresh, copyQuote, fetchQuote }
}
