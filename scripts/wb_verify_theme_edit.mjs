// 真机验证：强调色卡位置（辅色之后）+ 自定义主题可编辑（改名/改色）
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
const log = (ok, step, detail) => { results.push({ ok, step }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const NAME = '验证-edit'
const NAME2 = '验证-edit2'
const PRIMARY = '#4f46e5'
const PRIMARY2 = '#12a150'
const SECONDARY = '#0ea5e9'
const ACCENT = '#ff3b30'

try {
  const res = await pg.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: USER, password: PASS, remember: true }),
  })
  const j = await res.json()
  log(j.status === 'ok', 'login', `status=${j.status}`)

  const tkRes = await pg.request.get(`${BASE}/api/csrf-token`)
  const tk = (await tkRes.json()).token
  log(!!tk, 'csrf-token', `len=${tk ? tk.length : 0}`)

  // 创建待编辑的自定义配色
  const ctRes = await pg.request.post(`${BASE}/settings/custom-theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk },
    data: JSON.stringify({ name: NAME, primary: PRIMARY, secondary: SECONDARY, background: '#ffffff', text: '#1f2937', accent: ACCENT }),
  })
  const ct = await ctRes.json()
  log(ct.status === 'ok' && typeof ct.id === 'number', 'create-theme', `id=${ct.id}`)
  const cid = ct.id

  // 应用该主题，便于验证「编辑后激活态即时重应用」
  await pg.request.post(`${BASE}/settings/theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk },
    data: JSON.stringify({ theme: `custom:${cid}` }),
  })

  await pg.goto(BASE + '/', { waitUntil: 'networkidle' })
  await pg.waitForSelector('.wb-grid', { timeout: 15000 })

  // 打开设置抽屉
  await pg.click('button[aria-label="设置"]')
  await pg.waitForSelector('.settings-body', { timeout: 8000 })

  // 断言 1：色卡顺序 = 主色/辅色/强调/背景/文字（强调在辅色之后）
  const order = await pg.$$eval('.ct-colors .color-input', (els) =>
    els.map((e) => e.getAttribute('aria-label'))
  )
  const expectOrder = ['主色', '辅色', '强调', '背景', '文字']
  log(JSON.stringify(order) === JSON.stringify(expectOrder), 'swatch-order', `顺序=${JSON.stringify(order)} 期望=${JSON.stringify(expectOrder)}`)

  // 断言 2：点击编辑按钮后表单被载入原值
  const row = pg.locator('.theme-picker div.flex.items-center.justify-between', { hasText: NAME })
  await row.locator('button[aria-label="编辑配色"]').click()
  await sleep(150)
  const formName = await pg.inputValue('.ct-name')
  const formPrimary = await pg.inputValue('input.color-input[aria-label="主色"]')
  log(formName === NAME, 'edit-loaded-name', `表单名称=${formName} 期望=${NAME}`)
  log(formPrimary.toLowerCase() === PRIMARY.toLowerCase(), 'edit-loaded-primary', `表单主色=${formPrimary} 期望=${PRIMARY}`)
  const btnLabel = await pg.locator('button.ct-add').innerText()
  log(btnLabel.includes('保存修改'), 'edit-btn-label', `按钮文案=${btnLabel}`)

  // 断言 3：改名 + 改主色后保存
  await pg.fill('.ct-name', NAME2)
  await pg.fill('input.color-input[aria-label="主色"]', PRIMARY2)
  await pg.locator('button.ct-add').click()
  await sleep(300)

  // 断言 4：API 列表反映新名称 + 新主色
  const listRes = await pg.request.get(`${BASE}/api/custom-themes`)
  const list = await listRes.json()
  const mine = (list.themes || []).find((t) => t.id === cid)
  log(mine && mine.name === NAME2, 'api-name-updated', `name=${mine ? mine.name : 'null'} 期望=${NAME2}`)
  log(mine && mine.primary.toLowerCase() === PRIMARY2.toLowerCase(), 'api-primary-updated', `primary=${mine ? mine.primary : 'null'} 期望=${PRIMARY2}`)

  // 断言 5：激活态即时重应用（--p 等于新主色 HSL）
  const pVar = await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--p').trim())
  log(pVar === hexToHsl(PRIMARY2), 'active-reapplied', `--p="${pVar}" 期望="${hexToHsl(PRIMARY2)}"`)

  // 断言 6：编辑态已退出（按钮回到「添加配色」，表单清空）
  const btnLabel2 = await pg.locator('button.ct-add').innerText()
  log(btnLabel2.includes('添加配色'), 'edit-exited', `按钮文案=${btnLabel2}`)

  // 清理
  await pg.request.post(`${BASE}/settings/custom-theme/${cid}/delete`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk }, data: '{}',
  })
  await pg.request.post(`${BASE}/settings/theme`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tk }, data: JSON.stringify({ theme: 'light' }),
  })
  log(true, 'cleanup', `已删除 custom:${cid} 并还原 light`)

  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无')
} catch (e) {
  log(false, 'exception', e.message)
} finally {
  const pass = results.filter((r) => r.ok).length
  console.log(`\n汇总：${pass}/${results.length} 通过`)
  await browser.close()
  process.exit(pass === results.length ? 0 : 1)
}
