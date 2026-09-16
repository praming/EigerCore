/**
 * theme.ts —— 主题应用与配色转换（移植自 app/utils.py 的 hex_to_hsl / on_color，
 * 以及 app/__init__.py 的自定义配色注入逻辑），供 SPA 在客户端复刻 Jinja 的
 * data-theme / CSS 变量注入行为，保证「零视觉回归」。
 */

/** 内置主题清单（与 app/routes.py::THEME_CHOICES 逐字对应） */
export const THEME_CHOICES: { name: string; label: string }[] = [
  { name: 'light', label: '浅色' },
  { name: 'dark', label: '暗夜' },
  { name: 'cupcake', label: '糖果' },
  { name: 'synthwave', label: '赛博朋克' },
  { name: 'emerald', label: '翠绿' },
  { name: 'corporate', label: '商务' },
  { name: 'retro', label: '复古' },
  { name: 'cyberpunk', label: '霓虹' },
  { name: 'dracula', label: '德古拉' },
  { name: 'nord', label: '北欧' },
  { name: 'winter', label: '寒冬' },
  { name: 'luxury', label: '奢华' },
  { name: 'forest', label: '森林' },
  { name: 'valentine', label: '浪漫' },
  { name: 'autumn', label: '秋日' },
  { name: 'business', label: '极简' },
  { name: 'night', label: '夜晚' },
  { name: 'coffee', label: '咖啡' },
  { name: 'lemonade', label: '柠檬' },
  { name: 'sunset', label: '日落' },
]

export const BUILTIN_THEME_NAMES = new Set(THEME_CHOICES.map((t) => t.name))

/** #rrggbb / rrggbb → [r,g,b]（0~255）；非法返回 null */
function parseHex(hex: string): [number, number, number] | null {
  let h = (hex || '').trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** 移植自 app/utils.py::hex_to_hsl：#rrggbb → "H S% L%"，供 hsl(var(--p)) 使用 */
export function hexToHsl(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return '245 75% 58%'
  const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  const l = (mx + mn) / 2
  let hDeg = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) hDeg = ((g - b) / d) % 6
    else if (mx === g) hDeg = (b - r) / d + 2
    else hDeg = (r - g) / d + 4
    hDeg *= 60
    if (hDeg < 0) hDeg += 360
  }
  return `${Math.round(hDeg)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** 标准 WCAG 相对亮度，用于 on_color 阈值判断 */
function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 1
  const lin = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** 移植自 app/utils.py::on_color：主色之上的文字色（HSL 三元组） */
export function onColor(hex: string): string {
  return relativeLuminance(hex) < 0.5 ? '0 0% 100%' : '0 0% 12%'
}

export interface CustomThemeColors {
  primary: string
  secondary: string
  background: string
  text: string
  /** 强调色（第 5 项）：驱动开关/勾选/聚焦环等强调态 */
  accent: string
}

/** 把自定义配色注入 <style id="custom-vars">，并切到 data-theme="custom" */
export function applyCustomTheme(colors: CustomThemeColors) {
  const root = document.documentElement
  root.setAttribute('data-theme', 'custom')
  const accent = colors.accent || '#f59e0b'
  const css =
    `html[data-theme="custom"]{` +
    `--p:${hexToHsl(colors.primary)};` +
    `--s:${hexToHsl(colors.secondary)};` +
    `--b1:${hexToHsl(colors.background)};` +
    `--b2:${hexToHsl(colors.background)};` +
    `--bc:${hexToHsl(colors.text)};` +
    `--pc:${onColor(colors.primary)};` +
    `--a:${hexToHsl(accent)};` +
    `--af:${hexToHsl(accent)};}`
  let el = document.getElementById('custom-vars') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'custom-vars'
    document.head.appendChild(el)
  }
  el.textContent = css
}

/** 应用主题：内置主题直接设 data-theme；custom:N 需配合自定义配色列表解析 */
export function applyTheme(theme: string, customThemes: { id: number; primary: string; secondary: string; background: string; text: string; accent: string }[] = []) {
  if (theme.startsWith('custom:')) {
    const cid = parseInt(theme.split(':', 2)[1], 10)
    const ct = customThemes.find((c) => c.id === cid)
    if (ct) {
      applyCustomTheme(ct)
      return
    }
    // 配色不存在 → 回退浅色
    theme = 'light'
  }
  // 内置主题：移除可能存在的自定义变量注入
  const el = document.getElementById('custom-vars')
  if (el) el.textContent = ''
  document.documentElement.setAttribute('data-theme', theme)
}
