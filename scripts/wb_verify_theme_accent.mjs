// 真机验证：自定义主题 bug 修复 + 强调色(accent)全链路
// 1) 自定义主题选定后真正生效（data-theme=custom，不再回退 light）—— 修 split bug
// 2) 新增的「强调色」第 5 项：前端表单→后端→注入 --a → 开关/勾选等强调态可见
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
const log = (ok, step, detail) => { results.push({ ok, step }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 复刻前端 hexToHsl，用于断言注入值精确等于所选 accent
function hexToHsl(hex) {
  let h = (hex || '').trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2
  let hDeg = 0, s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) hDeg = ((g - b) / d) % 6
    else if (mx === g) hDeg = (b - r) / d + 2
    else hDeg = (r - g) / d + 4
    hDeg *= 60; if (hDeg < 0) hDeg += 360
  }
  return `${Math.round(hDeg)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const pg = await ctx.newPage()
const errors = []
pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })

const ACCENT = '#ff3b30'
const PRIMARY = '#4f46e5'

try {
  // 登录（免 CSRF）
  const res = await pg.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: USER, password: PASS, remember: true }),
  })
  const j = await res.json()
  log(j.status === 'ok', 'login', `status=${j.status}`)

  // 取 CSRF 令牌
  const tkRes = await pg.request.get(`${BASE}/api/csrf-token`)
  const tk = (await tkRes.json()).token
  log(!!tk, 'csrf-token', `len=${tk ? tk.length : 0}`)

  // 创建含强调色的自定义配色
  const ctRes = await pg.request.post(`${BASE}/settings/custom-theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk },
    data: JSON.stringify({ name: '验证-accent', primary: PRIMARY, secondary: '#0ea5e9', background: '#ffffff', text: '#1f2937', accent: ACCENT }),
  })
  const ct = await ctRes.json()
  log(ct.status === 'ok' && typeof ct.id === 'number', 'create-theme', `id=${ct.id} status=${ct.status}`)
  const cid = ct.id

  // 应用该自定义主题
  const setRes = await pg.request.post(`${BASE}/settings/theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk },
    data: JSON.stringify({ theme: `custom:${cid}` }),
  })
  const setJ = await setRes.json()
  log(setJ.status === 'ok', 'set-theme', `theme=custom:${cid} status=${setJ.status}`)

  // 重新进入，等待 SPA 应用主题
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' })
  await pg.waitForSelector('.wb-grid', { timeout: 15000 })

  // 断言 1：data-theme 真正为 custom（bug 修复核心证据）
  const dataTheme = await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))
  log(dataTheme === 'custom', 'theme-applied', `data-theme=${dataTheme}（修复前会回退 light）`)

  // 断言 2：--a 注入且精确等于所选 accent 的 HSL
  const vars = await pg.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return { a: cs.getPropertyValue('--a').trim(), p: cs.getPropertyValue('--p').trim() }
  })
  const expectedA = hexToHsl(ACCENT)
  log(vars.a === expectedA, 'accent-var', `--a="${vars.a}" 期望="${expectedA}"`)
  log(vars.a !== vars.p, 'accent-distinct', `--a≠--p（强调色独立于主色）`)

  // 断言 3：强调态（WbSwitch 选中）背景跟随 --a
  const accentBg = await pg.evaluate(() => {
    let sw = document.querySelector('.wb-switch')
    if (!sw) { sw = document.createElement('div'); sw.className = 'wb-switch is-on'; document.body.appendChild(sw) }
    else sw.classList.add('is-on')
    const a = getComputedStyle(document.documentElement).getPropertyValue('--a').trim()
    const probe = document.createElement('div'); probe.style.background = `hsl(${a})`
    document.body.appendChild(probe)
    const ref = getComputedStyle(probe).backgroundColor
    const bg = getComputedStyle(sw).backgroundColor
    probe.remove()
    return { bg, ref }
  })
  log(accentBg.bg === accentBg.ref, 'accent-visible', `开关选中背景=${accentBg.bg} 参考hsl(--a)=${accentBg.ref}`)

  // 断言 4：API 列表回显 accent 字段
  const listRes = await pg.request.get(`${BASE}/api/custom-themes`)
  const list = await listRes.json()
  const mine = (list.themes || []).find((t) => t.id === cid)
  log(mine && mine.accent === ACCENT, 'api-accent', `themes回显 accent=${mine ? mine.accent : 'null'}`)

  // 清理：删除测试配色 + 还原 light
  await pg.request.post(`${BASE}/settings/custom-theme/${cid}/delete`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk }, data: '{}',
  })
  await pg.request.post(`${BASE}/settings/theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk }, data: JSON.stringify({ theme: 'light' }),
  })
  log(true, 'cleanup', `已删除测试配色 custom:${cid} 并还原 light`)

  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无')
} catch (e) {
  log(false, 'exception', e.message)
} finally {
  const pass = results.filter((r) => r.ok).length
  console.log(`\n汇总：${pass}/${results.length} 通过`)
  await browser.close()
  process.exit(pass === results.length ? 0 : 1)
}
