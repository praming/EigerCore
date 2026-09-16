/**
 * 单位换算工具库（工具箱：单位换算 / 长度换算 / 重量换算）。
 *
 * 统一模型：每个单位给出「相对该分类基准单位的倍数」factor，
 * 换算即 value × fromFactor ÷ toFactor。温度为仿射变换（有偏移），单独处理。
 */

export interface UnitDef {
  key: string
  name: string
  factor: number // 相对基准单位的倍数
}

export interface UnitCategory {
  key: string
  name: string
  base: string // 基准单位名（仅用于说明文案）
  units: UnitDef[]
}

/** 长度（基准：米） */
export const LENGTH_UNITS: UnitDef[] = [
  { key: 'mm', name: '毫米 mm', factor: 0.001 },
  { key: 'cm', name: '厘米 cm', factor: 0.01 },
  { key: 'dm', name: '分米 dm', factor: 0.1 },
  { key: 'm', name: '米 m', factor: 1 },
  { key: 'km', name: '千米 km', factor: 1000 },
  { key: 'in', name: '英寸 in', factor: 0.0254 },
  { key: 'ft', name: '英尺 ft', factor: 0.3048 },
  { key: 'yd', name: '码 yd', factor: 0.9144 },
  { key: 'mi', name: '英里 mi', factor: 1609.344 },
  { key: 'nmi', name: '海里 nmi', factor: 1852 },
  { key: 'li', name: '市里', factor: 500 },
  { key: 'zhang', name: '市丈', factor: 10 / 3 },
  { key: 'chi', name: '市尺', factor: 1 / 3 },
  { key: 'cun', name: '市寸', factor: 1 / 30 },
]

/** 重量（基准：千克） */
export const WEIGHT_UNITS: UnitDef[] = [
  { key: 'mg', name: '毫克 mg', factor: 1e-6 },
  { key: 'g', name: '克 g', factor: 0.001 },
  { key: 'kg', name: '千克 kg', factor: 1 },
  { key: 't', name: '吨 t', factor: 1000 },
  { key: 'jin', name: '市斤', factor: 0.5 },
  { key: 'liang', name: '市两', factor: 0.05 },
  { key: 'qian', name: '市钱', factor: 0.005 },
  { key: 'lb', name: '磅 lb', factor: 0.45359237 },
  { key: 'oz', name: '盎司 oz', factor: 0.028349523125 },
  { key: 'ct', name: '克拉 ct', factor: 0.0002 },
]

/** 通用「单位换算」的分类（温度另走仿射公式，units 留占位 factor=1） */
export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    key: 'temp',
    name: '温度',
    base: '摄氏度',
    units: [
      { key: 'C', name: '摄氏度 °C', factor: 1 },
      { key: 'F', name: '华氏度 °F', factor: 1 },
      { key: 'K', name: '开尔文 K', factor: 1 },
    ],
  },
  {
    key: 'area',
    name: '面积',
    base: '平方米',
    units: [
      { key: 'mm2', name: '平方毫米 mm²', factor: 1e-6 },
      { key: 'cm2', name: '平方厘米 cm²', factor: 1e-4 },
      { key: 'm2', name: '平方米 m²', factor: 1 },
      { key: 'km2', name: '平方千米 km²', factor: 1e6 },
      { key: 'ha', name: '公顷 ha', factor: 1e4 },
      { key: 'mu', name: '亩', factor: 2000 / 3 },
      { key: 'ac', name: '英亩 ac', factor: 4046.8564224 },
      { key: 'ft2', name: '平方英尺 ft²', factor: 0.09290304 },
    ],
  },
  {
    key: 'volume',
    name: '体积 / 容积',
    base: '升',
    units: [
      { key: 'ml', name: '毫升 mL', factor: 0.001 },
      { key: 'l', name: '升 L', factor: 1 },
      { key: 'm3', name: '立方米 m³', factor: 1000 },
      { key: 'cm3', name: '立方厘米 cm³', factor: 0.001 },
      { key: 'galus', name: '加仑（美）', factor: 3.785411784 },
      { key: 'ptus', name: '品脱（美）', factor: 0.473176473 },
      { key: 'ft3', name: '立方英尺 ft³', factor: 28.316846592 },
    ],
  },
  {
    key: 'data',
    name: '数据存储',
    base: '字节',
    units: [
      { key: 'bit', name: '比特 bit', factor: 0.125 },
      { key: 'B', name: '字节 B', factor: 1 },
      { key: 'KB', name: '千字节 KB', factor: 1024 },
      { key: 'MB', name: '兆字节 MB', factor: 1024 ** 2 },
      { key: 'GB', name: '吉字节 GB', factor: 1024 ** 3 },
      { key: 'TB', name: '太字节 TB', factor: 1024 ** 4 },
      { key: 'PB', name: '拍字节 PB', factor: 1024 ** 5 },
    ],
  },
  {
    key: 'speed',
    name: '速度',
    base: '米/秒',
    units: [
      { key: 'mps', name: '米/秒 m/s', factor: 1 },
      { key: 'kmph', name: '千米/时 km/h', factor: 1 / 3.6 },
      { key: 'mph', name: '英里/时 mph', factor: 0.44704 },
      { key: 'kn', name: '节 kn', factor: 1852 / 3600 },
      { key: 'ftps', name: '英尺/秒 ft/s', factor: 0.3048 },
    ],
  },
  {
    key: 'time',
    name: '时间',
    base: '秒',
    units: [
      { key: 'ms', name: '毫秒 ms', factor: 0.001 },
      { key: 's', name: '秒 s', factor: 1 },
      { key: 'min', name: '分钟 min', factor: 60 },
      { key: 'h', name: '小时 h', factor: 3600 },
      { key: 'd', name: '天 d', factor: 86400 },
      { key: 'w', name: '周 w', factor: 604800 },
      { key: 'y', name: '年（365 天）', factor: 31536000 },
    ],
  },
]

/** 按倍数换算（同一分类内） */
export function convertByFactor(value: number, from: UnitDef, to: UnitDef): number {
  if (!Number.isFinite(value)) return NaN
  return (value * from.factor) / to.factor
}

/** 温度换算（摄氏 / 华氏 / 开尔文） */
export function convertTemp(value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) return NaN
  // 先统一到摄氏度
  let c: number
  if (from === 'F') c = ((value - 32) * 5) / 9
  else if (from === 'K') c = value - 273.15
  else c = value
  if (to === 'F') return (c * 9) / 5 + 32
  if (to === 'K') return c + 273.15
  return c
}

/**
 * 结果格式化：大数走科学计数法，其余最多保留 8 位有效小数并去掉尾随 0，
 * 避免出现 0.30000000000000004 这类浮点噪声。
 */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6)
  const s = n.toFixed(8)
  return s.replace(/\.?0+$/, '') || '0'
}

// ============ Base64 ============

/** UTF-8 安全的 Base64 编码 */
export function b64Encode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** UTF-8 安全的 Base64 解码；非法输入抛错由调用方兜底 */
export function b64Decode(s: string): string {
  const bin = atob(s.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// ============ 日期 / 时间戳 ============

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 取本地日期的 YYYY-MM-DD */
export function toDateStr(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 取本地日期时间的 YYYY-MM-DD HH:mm:ss */
export function toDateTimeStr(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${toDateStr(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 星期中文（周三） */
export function weekCn(d: Date): string {
  return '周' + WEEK_CN[d.getDay()]
}

/** 解析 YYYY-MM-DD（按本地时区，避免 new Date('2026-09-02') 被当成 UTC 而差一天） */
export function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((s || '').trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

/** 日期推算：在基准日上加减 n 个 天/周/月/年 */
export function shiftDate(base: Date, n: number, unit: 'day' | 'week' | 'month' | 'year'): Date {
  const d = new Date(base.getTime())
  if (unit === 'day') d.setDate(d.getDate() + n)
  else if (unit === 'week') d.setDate(d.getDate() + n * 7)
  else if (unit === 'month') d.setMonth(d.getMonth() + n)
  else d.setFullYear(d.getFullYear() + n)
  return d
}

/** 两个日期相差的整天数（按本地零点计算，忽略时分秒） */
export function diffDays(a: Date, b: Date): number {
  const t1 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const t2 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((t2 - t1) / 86400000)
}
