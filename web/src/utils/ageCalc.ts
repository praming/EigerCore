// 年龄 / 生日计算：给定出生日期，返回周岁、月龄、天数、距下次生日等

const Animals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']

export interface AgeResult {
  years: number
  months: number
  days: number
  totalDays: number
  nextBirthdayInDays: number
  zodiac: string
  valid: boolean
}

/** birth: YYYY-MM-DD（或标准日期字符串） */
export function ageCalc(birth: string): AgeResult {
  const b = new Date(birth + 'T00:00:00')
  const invalid: AgeResult = {
    years: 0, months: 0, days: 0, totalDays: 0, nextBirthdayInDays: 0,
    zodiac: '', valid: false,
  }
  if (Number.isNaN(b.getTime())) return invalid

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (b.getTime() > now.getTime()) return invalid

  // 总天数
  const totalDays = Math.floor((now.getTime() - b.getTime()) / 86400000)

  // 周岁 / 月龄 / 日
  let years = now.getFullYear() - b.getFullYear()
  let months = now.getMonth() - b.getMonth()
  let days = now.getDate() - b.getDate()
  if (days < 0) {
    months -= 1
    // 上个月的天数
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  // 距下次生日
  let next = new Date(now.getFullYear(), b.getMonth(), b.getDate())
  if (next.getTime() <= now.getTime()) {
    next = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate())
  }
  const nextBirthdayInDays = Math.floor((next.getTime() - now.getTime()) / 86400000)

  const zodiac = Animals[(b.getFullYear() - 4) % 12 < 0 ? (b.getFullYear() - 4) % 12 + 12 : (b.getFullYear() - 4) % 12]

  return { years, months, days, totalDays, nextBirthdayInDays, zodiac, valid: true }
}
