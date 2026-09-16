// 万年历丰富数据封装（基于 offline `lunar-javascript`，覆盖图片中所有字段）。
// 兼容 1900–2100，统一入口 `wanliOf(y,m,d)` 输出 UI 用结构化对象。
// 不发起任何网络请求，零密钥、零配额。

import { Solar, Lunar } from 'lunar-javascript'

// 中国现代纪念日/国际节日等（lunar-javascript 节日库只覆盖部分传统节日，需补）：
// 注意：农历节日已由 lunar-javascript 提供，本表只补公历纪念日。
const MOD_HOLIDAYS: ReadonlyArray<{ m: number; d: number; name: string }> = [
  { m: 1, d: 1, name: '元旦' },
  { m: 2, d: 14, name: '情人节' },
  { m: 3, d: 8, name: '国际妇女节' },
  { m: 3, d: 12, name: '植树节' },
  { m: 3, d: 15, name: '消费者权益日' },
  { m: 4, d: 1, name: '愚人节' },
  { m: 4, d: 22, name: '世界地球日' },
  { m: 5, d: 1, name: '劳动节' },
  { m: 5, d: 4, name: '青年节' },
  { m: 5, d: 8, name: '世界红十字日' },
  { m: 6, d: 1, name: '儿童节' },
  { m: 6, d: 8, name: '世界海洋日' },
  { m: 7, d: 1, name: '建党节' },
  { m: 8, d: 1, name: '建军节' },
  { m: 9, d: 3, name: '中国人民抗日战争胜利纪念日' },
  { m: 9, d: 10, name: '教师节' },
  { m: 9, d: 18, name: '九一八事变纪念日' },
  { m: 10, d: 1, name: '国庆节' },
  { m: 11, d: 1, name: '万圣节' },
  { m: 11, d: 17, name: '国际大学生节' },
  { m: 12, d: 13, name: '南京大屠杀死难者国家公祭日' },
  { m: 12, d: 24, name: '平安夜' },
  { m: 12, d: 25, name: '圣诞节' },
]

// 12 生肖
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']

// 星座名（中文化补「座」）
const XINGZUO_SUFFIX = '座'

const MONTH_CN = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
]

// 12 星座对应公历范围（按月-日起点，简化版）
const XINGZUO_RANGE: Array<{ start: [number, number]; name: string }> = [
  { start: [12, 22], name: '摩羯' },
  { start: [1, 1], name: '水瓶' },
  { start: [1, 20], name: '双鱼' },
  { start: [2, 19], name: '白羊' },
  { start: [3, 21], name: '金牛' },
  { start: [4, 20], name: '双子' },
  { start: [5, 21], name: '巨蟹' },
  { start: [6, 22], name: '狮子' },
  { start: [7, 23], name: '处女' },
  { start: [8, 23], name: '天秤' },
  { start: [9, 23], name: '天蝎' },
  { start: [10, 24], name: '射手' },
  { start: [11, 23], name: '射手' },
]

// 季节名（按月分）
function seasonOf(m: number): string {
  if (m === 3 || m === 4 || m === 5) return '春季'
  if (m === 6 || m === 7 || m === 8) return '夏季'
  if (m === 9 || m === 10 || m === 11) return '秋季'
  return '冬季'
}

// 公历 y/m/d → 星座名（按上表分隔月判断；lunar-javascript 的 getXingZuo 不含「座」字，我们补齐）
function xingZuoOf(m: number, d: number): string {
  // 取 Solar.getXingZuo 通常已是'摩羯座'类，但 1.7.7 实测返回 '摩羯'/'双鱼'/'处女' 等无「座」
  // 为稳妥，用 lunar-javascript.getXingZuo() 后追加 '座'（仅在末字非 '座' 时）
  return '' // 由调用方用 solar.getXingZuo() 自补
}

export interface WanliDayInfo {
  // 公历
  year: number
  month: number
  day: number
  weekCn: string
  julianDay: number
  xingZuo: string
  season: string

  // 农历
  ganzhiYear: string // 丙午
  ganzhiMonth: string // 丙申
  ganzhiDay: string // 庚辰
  yearInChinese: string // 二零二六
  monthInChinese: string // 七月
  dayInChinese: string // 廿二
  zodiac: string // 马（生肖）
  dayZodiac: string // 狗
  monthZodiac: string // 戌月
  yearNaYin: string // 天河水
  monthNaYin: string // 山下火
  dayNaYin: string // 白蜡金

  // 节气
  jieqi: string | null
  prevJieName: string
  prevJieDays: number // 第 N 天
  nextJieName: string
  nextJieDays: number // 还有 N 天

  // 节日
  festivals: string[] // 传统/阴历节日（如 春节、七夕）
  otherFestivals: string[] // 农历库自带的公历节日
  modHolidays: string[] // 补充的现代纪念日（公历）

  // 宜忌
  yi: string[]
  ji: string[]

  // 黄历
pengZuGan: string // 庚不经络织机虚张
    pengZuZhi: string // 辰不哭泣必主重丧
    posTai: string // 碓磨栖 外正西
    chongDesc: string // 狗
  chongGanTie: string // 甲戌
  sha: string // 南
  liuYao: string // 佛灭
  xiu: string // 奎
  xiuLuck: string // 凶
  jiShen: string[] // 当日吉神
  xiongSha: string[] // 当日凶煞

  // 太岁/喜神/福神/财神方位
  taiSuiName: string // 太岁名（如 董贤 之类的）
  taiSuiDesc: string // 太岁方位
  posXi: string // 喜神方位
  posFu: string // 福德/福神方位
  posCai: string // 财神方位
  posYangGui: string // 阳贵神方位
  posYinGui: string // 阴贵神方位
}

/**
 * 取万年历所需全部字段（基于 lunar-javascript 离线计算）。
 * @param y 公历年，@param m 1-12（与 new Date()/Solar.fromYmd 同步），@param d 1-31
 */
export function wanliOf(y: number, m: number, d: number): WanliDayInfo {
  const solar = Solar.fromYmd(y, m, d)
  const lunar: Lunar = solar.getLunar()

  // 节气距离
  const prev = safeJieQi(lunar.getPrevJieQi())
  const next = safeJieQi(lunar.getNextJieQi())
  const prevName = prev ? prev.getName() : ''
  const nextName = next ? next.getName() : ''
  const prevDays = prev ? daysBetween(prev.getSolar(), solar) + 1 : 0 // 第 N 天
  const nextDays = next ? daysBetween(solar, next.getSolar()) : 0 // 还有 N 天

  const xzRaw = safeStr(solar.getXingZuo())
  const xingZuo = xzRaw.endsWith(XINGZUO_SUFFIX) ? xzRaw : xzRaw + XINGZUO_SUFFIX

  // 现代纪念日（公历补）
  const mod = MOD_HOLIDAYS.filter((h) => h.m === m && h.d === d).map((h) => h.name)

  // 节日合并：传统（festivals）+ lunar-javascript 公历(otherFestivals) + 现代（modHolidays）
  const festivals = safeArr(lunar.getFestivals())
  const otherFestivals = safeArr(lunar.getOtherFestivals()).filter((n) => !mod.includes(n))

  return {
    year: y,
    month: m,
    day: d,
    weekCn: safeStr(lunar.getWeekInChinese()),
    julianDay: solar.getJulianDay(),
    xingZuo,
    season: seasonOf(m),

    ganzhiYear: safeStr(lunar.getYearInGanZhi()),
    ganzhiMonth: safeStr(lunar.getMonthInGanZhi()),
    ganzhiDay: safeStr(lunar.getDayInGanZhi()),
    yearInChinese: safeStr(lunar.getYearInChinese()),
    monthInChinese: safeStr(lunar.getMonthInChinese()),
    dayInChinese: safeStr(lunar.getDayInChinese()),
    zodiac: safeStr(lunar.getYearShengXiao()),
    dayZodiac: safeStr(lunar.getDayShengXiao()),
    monthZodiac: zhiToZodiac(safeStr(lunar.getMonthInGanZhi())),
    yearNaYin: safeAt(lunar.getBaZiNaYin(), 0),
    monthNaYin: safeAt(lunar.getBaZiNaYin(), 1),
    dayNaYin: safeAt(lunar.getBaZiNaYin(), 2),

    jieqi: lunar.getJieQi() || null,
    prevJieName: prevName,
    prevJieDays: prevDays,
    nextJieName: nextName,
    nextJieDays: nextDays,

    festivals,
    otherFestivals,
    modHolidays: mod,

    yi: safeArr(lunar.getDayYi()),
    ji: safeArr(lunar.getDayJi()),

    pengZuGan: safeStr(lunar.getPengZuGan()),
    pengZuZhi: safeStr(lunar.getPengZuZhi()),
    posTai: safeStr(lunar.getDayPositionTai()),
    chongDesc: safeStr(lunar.getDayChongDesc()),
    chongGanTie: safeStr(lunar.getDayChongGanTie()),
    sha: safeStr(lunar.getDaySha()),
    liuYao: safeStr(lunar.getLiuYao()),
    xiu: safeStr(lunar.getXiu()),
    xiuLuck: safeStr(lunar.getXiuLuck()),
    jiShen: safeArr(lunar.getDayJiShen()),
    xiongSha: safeArr(lunar.getDayXiongSha()),

    taiSuiName: safeStr(lunar.getDayPositionTaiSui()),
    taiSuiDesc: safeStr(lunar.getDayPositionTaiSuiDesc()),
    posXi: safeStr(lunar.getDayPositionXiDesc()),
    posFu: safeStr(lunar.getDayPositionFuDesc()),
    posCai: safeStr(lunar.getDayPositionCaiDesc()),
    posYangGui: safeStr(lunar.getDayPositionYangGuiDesc()),
    posYinGui: safeStr(lunar.getDayPositionYinGuiDesc()),
  }
}

// —— helpers ——
function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : []
}
function safeAt<T>(v: unknown, i: number): T {
  return Array.isArray(v) ? (v[i] as T) : ('' as T)
}
function safeJieQi(v: { getName(): string; getSolar(): Solar } | null | undefined) {
  if (!v) return null
  try {
    return v
  } catch {
    return null
  }
}
function daysBetween(a: Solar, b: Solar): number {
  return Math.round((b.getJulianDay() - a.getJulianDay()))
}
function zhiToZodiac(gz: string): string {
  // "丙申" → 取最后一个字「申」→ 「猴」
  const zhi = gz.slice(-1)
  const idx = '子丑寅卯辰巳午未申酉戌亥'.indexOf(zhi)
  return idx >= 0 ? ZODIAC[idx] : ''
}

// —— 伊斯兰历（公历 → Hijri，Tabular Islamic Calendar，Umm al-Qura 误差 1~2 天）——
export function hijriOf(y: number, m: number, d: number): string {
  const jd = toJulianDay(y, m, d)
  const hdn = jd - 1948440
  const hYear = Math.floor((hdn - 1) / 354) + 1
  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29]
  const firstOfYear = hdnOfHijriYear(hYear)
  const dayOfYear = hdn - firstOfYear + 1
  let acc = 0
  let hMonth = 0
  for (let i = 0; i < 12; i++) {
    acc += monthLengths[i]
    if (dayOfYear <= acc) {
      hMonth = i + 1
      break
    }
  }
  const hDay = dayOfYear - (acc - (monthLengths[hMonth - 1] || 30))
  return `${hYear}年${pad2(hMonth)}月${pad2(Math.max(1, hDay))}日`
}
function hdnOfHijriYear(hy: number): number {
  return 1948440 + Math.floor((hy - 1) * 354.367)
}
function toJulianDay(y: number, m: number, d: number): number {
  const y2 = m <= 2 ? y - 1 : y
  const m2 = m <= 2 ? m + 12 : m
  const A = Math.floor(y2 / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y2 + 4716)) + Math.floor(30.6001 * (m2 + 1)) + d + B - 1524.5
}
function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}
