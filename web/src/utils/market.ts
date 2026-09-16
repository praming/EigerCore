// A 股开市时段判断（前端，供自选股自动刷新使用）
// 规则：周一至周五，上午 9:30–11:30、下午 13:00–15:00 为连续竞价交易时段；
// 周六、周日为周末休市；法定节假日（含调休）按国务院放假安排休市；
// 调休补班日（原周末被安排上班）照常开市。
import { getDayInfo } from './festivals'

/** A 股上午连续竞价时段（分钟）9:30–11:30 */
const MORNING_START = 9 * 60 + 30
const MORNING_END = 11 * 60 + 30
/** A 股下午连续竞价时段（分钟）13:00–15:00 */
const AFTERNOON_START = 13 * 60
const AFTERNOON_END = 15 * 60

/**
 * 判断给定时刻是否处于 A 股开市时段（默认当前时刻）。
 * @returns true = 开市（应自动刷新行情），false = 休市。
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const day = now.getDay() // 0=周日, 1=周一 … 6=周六
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()

  // 复用节假日数据：法定假日（非补班）休市；调休补班日（含周末）开市
  const info = getDayInfo(y, m, d)
  if (info.isHoliday && !info.isWorkday) return false // 法定假日休息
  if (info.isWorkday) return true // 调休补班 → 开市

  // 普通周末（非补班）：休市
  if (day === 0 || day === 6) return false

  // 普通工作日：判断是否在交易时段内
  const mins = now.getHours() * 60 + now.getMinutes()
  const inMorning = mins >= MORNING_START && mins <= MORNING_END
  const inAfternoon = mins >= AFTERNOON_START && mins <= AFTERNOON_END
  return inMorning || inAfternoon
}

/** 是否处于交易日（非周末、非法定假日；含调休补班日）—用于判断「今天是否开盘」 */
export function isTradingDay(now: Date = new Date()): boolean {
  const day = now.getDay()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const info = getDayInfo(y, m, d)
  if (info.isHoliday && !info.isWorkday) return false
  if (info.isWorkday) return true
  return day !== 0 && day !== 6
}
