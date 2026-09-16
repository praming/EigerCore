import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'
const results = []
const ok = (n, c, extra = '') => results.push(`${c ? 'PASS' : 'FAIL'} | ${n}${extra ? ' | ' + extra : ''}`)

const browser = await pw.chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle' })

// —— 登录（复刻 SPA 握手）——
const login = await page.evaluate(async ([u, p]) => {
  const r1 = await fetch('/api/csrf-token', { credentials: 'include' })
  const t1 = await r1.json()
  const r2 = await fetch('/api/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': t1.token },
    body: JSON.stringify({ username: u, password: p, remember: true }),
  })
  return { status: r2.status, ok: r2.ok }
}, [USER, PASS])
ok('登录成功', login.ok && login.status === 200, `status=${login.status}`)

await page.reload({ waitUntil: 'networkidle' })

// 进入工作台视图
await page.getByText('工作台', { exact: true }).first().click()
await page.waitForSelector('.wb-weather-card', { timeout: 15000 })
await page.waitForTimeout(800)

// —— 1. 全站无渐变 ——
const grad = await page.evaluate(() => {
  const bad = []
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el)
    if (s.backgroundImage && s.backgroundImage.includes('gradient')) bad.push((el.className || el.tagName) + '::bgImage')
    if (s.background && s.background.includes('gradient')) bad.push((el.className || el.tagName) + '::bg')
  })
  return bad
})
ok('全站无渐变背景', grad.length === 0, grad.slice(0, 5).join(', '))

// —— 5. 工作台编辑按钮文案 + 图标(pencil 无 rect) ——
const editBtn = page.locator('button[title="编辑工作台"]')
ok('编辑按钮文案=编辑工作台', (await editBtn.count()) === 1)
const editHasRect = await editBtn.evaluate((el) => !!el.querySelector('svg rect')).catch(() => true)
ok('编辑按钮图标=铅笔(无rect)', editHasRect === false)

// —— 3. 常用链接无悬浮删除按钮 ——
const delCount = await page.locator('.wb-link__del').count()
ok('常用链接无悬浮删除按钮', delCount === 0, `count=${delCount}`)

// —— 1(续). 日历「回到今天」图标=主色 ——
const calColors = await page.evaluate(() => {
  const today = document.querySelector('.wb-cal__today')
  const primary = document.querySelector('.btn-primary')
  if (!today || !primary) return null
  return {
    today: getComputedStyle(today).color,
    primaryBg: getComputedStyle(primary).backgroundColor, // .btn-primary 背景即主色 --p
    accent: 'rgb(245, 158, 11)', // 默认强调色 #f59e0b，用于排除「仍是强调色」的情形
  }
})
ok('日历回到今天=主色(非强调色)',
  !!calColors && calColors.today === calColors.primaryBg && calColors.today !== calColors.accent,
  calColors ? `today=${calColors.today} primaryBg=${calColors.primaryBg}` : 'no-el')

// —— 2. 天气按间隔刷新：reload 后复用缓存、不重新请求 ——
// 先读取首次加载后的「已同步」标签与缓存标签
await page.waitForSelector('.wb-wl__sync', { timeout: 15000 })
const firstLabel = (await page.locator('.wb-wl__sync').first().textContent())?.trim()
const cacheBefore = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('wb_weather_cache_v1') || 'null') } catch { return null }
})
ok('天气缓存已写入', !!cacheBefore, cacheBefore ? 'label=' + cacheBefore.label : 'none')

// 监听 reload 期间的天气请求
let wxReq = 0
const onReq = (req) => { if (req.url().includes('/api/weather')) wxReq++ }
page.on('request', onReq)

await page.reload({ waitUntil: 'networkidle' })
await page.getByText('工作台', { exact: true }).first().click()
await page.waitForSelector('.wb-weather-card', { timeout: 15000 })
await page.waitForSelector('.wb-wl__sync', { timeout: 15000 })
await page.waitForTimeout(1200)
page.off('request', onReq)

const reloadLabel = (await page.locator('.wb-wl__sync').first().textContent())?.trim()
ok('reload 未重新请求天气(复用缓存)', wxReq === 0, `weather requests=${wxReq}`)
ok('reload 后「已同步」沿用缓存标签', !!firstLabel && reloadLabel === firstLabel, `first=${firstLabel} reload=${reloadLabel}`)

// 截图留存
await page.screenshot({ path: 'scripts/_verify_wb.png', fullPage: false })

// 展开天气详情看折线
await page.locator('.wb-weather-card').click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'scripts/_verify_wx.png', fullPage: false })

console.log('\n===== VERIFY RESULTS =====')
console.log(results.join('\n'))
console.log('\nconsole errors:', errors.length)
if (errors.length) console.log(errors.slice(0, 8).join('\n'))

await browser.close()
const failed = results.filter((r) => r.startsWith('FAIL'))
process.exit(failed.length ? 1 : 0)
