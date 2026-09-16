// 中国节日 / 法定节假日展示数据（前端，供日历卡使用）
// - 阳历固定节日：逐年恒定
// - 农历节日：通过 solarToLunar 计算农历月-日
// - 法定节假日：来自国务院办公厅年度放假调休通知，逐年补充（已收录 2026）

import { solarToLunar } from './lunar'

// 阳历固定节日（月-日 → 名称）
const SOLAR_FESTIVALS: Record<string, string> = {
  '1-1': '元旦',
  '2-14': '情人节',
  '3-8': '妇女节',
  '3-12': '植树节',
  '4-1': '愚人节',
  '5-1': '劳动节',
  '5-4': '青年节',
  '6-1': '儿童节',
  '7-1': '建党节',
  '8-1': '建军节',
  '9-3': '抗战胜利日',
  '9-10': '教师节',
  '10-1': '国庆节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
}

// 农历节日（农历月-日 → 名称）
const LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵',
  '2-2': '龙抬头',
  '5-5': '端午',
  '7-7': '七夕',
  '7-15': '中元',
  '8-15': '中秋',
  '9-9': '重阳',
  '12-8': '腊八',
  '12-23': '北方小年',
  '12-24': '南方小年',
}

interface HolidayRange {
  start: string
  end: string
  name: string
}
interface HolidayPlan {
  ranges: HolidayRange[]
  works: string[]
}

// 国务院部分节假日安排（国办发明电，逐年补充）
// ranges = 放假区间（含首尾）；works = 调休补班日
const HOLIDAY_PLAN: Record<number, HolidayPlan> = {
  2026: {
    ranges: [
      { start: '2026-01-01', end: '2026-01-03', name: '元旦' },
      { start: '2026-02-15', end: '2026-02-23', name: '春节' },
      { start: '2026-04-04', end: '2026-04-06', name: '清明' },
      { start: '2026-05-01', end: '2026-05-05', name: '劳动节' },
      { start: '2026-06-19', end: '2026-06-21', name: '端午' },
      { start: '2026-09-25', end: '2026-09-27', name: '中秋' },
      { start: '2026-10-01', end: '2026-10-07', name: '国庆' },
    ],
    works: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
  },
}

export interface DayInfo {
  /** 节日名称（阳历/农历节日），无则 null */
  festival: string | null
  /** 法定放假休息日 */
  isHoliday: boolean
  /** 调休补班日 */
  isWorkday: boolean
}

function ymd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

/** 取某公历日期的节日与节假日信息 */
export function getDayInfo(y: number, m: number, d: number): DayInfo {
  const date = ymd(y, m, d)
  const solarKey = `${m}-${d}`
  const lunar = solarToLunar(y, m, d)
  const lunarKey = `${lunar.month}-${lunar.day}`

  let festival: string | null = SOLAR_FESTIVALS[solarKey] ?? null
  if (!festival) festival = LUNAR_FESTIVALS[lunarKey] ?? null

  const plan = HOLIDAY_PLAN[y]
  let isHoliday = false
  if (plan) {
    for (const r of plan.ranges) {
      if (inRange(date, r.start, r.end)) {
        isHoliday = true
        break
      }
    }
  }
  const isWorkday = !!plan && plan.works.includes(date)

  return { festival, isHoliday, isWorkday }
}
