import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000/'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

// 两个已知持仓：100*10 + 50*20 = 2000.00
const SEED = [
  { id: 9001, code: '600519', name: '贵州茅台', buyPrice: 100, shares: 10, costDate: '2026-01-01' },
  { id: 9002, code: '000001', name: '平安银行', buyPrice: 50, shares: 20, costDate: '2026-01-02' },
]

const results = []
function ok(name, cond, info = '') { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`) }

const run = async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', channel: 'msedge' })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => results.push(`FAIL  前端运行时异常  (${e.message})`))

    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token }
    await api.post(BASE + 'api/login', { headers, data: { username: USER, password: PASS, remember: true } })

    // 读取现有状态并注入持仓（保留其余卡片默认）
    const cur = await (await api.get(BASE + 'api/workbench/state')).json()
    const state = cur.state && typeof cur.state === 'object' ? JSON.parse(JSON.stringify(cur.state)) : {}
    state.prefs = state.prefs || {}
    state.prefs.watchlist = state.prefs.watchlist || { holdings: [], autoRefresh: { enabled: false, interval: 30 } }
    state.prefs.watchlist.holdings = SEED
    const put = await api.put(BASE + 'api/workbench/state', { headers, data: { state } })
    ok('保存工作台状态(含持仓)', put.status() === 200, 'HTTP ' + put.status())

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    // 定位自选股卡片的合计行
    const card = page.locator('.wb-wl').first()
    await card.waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(600)

    const sub = page.locator('.wb-wl__sub').first()
    const subText = (await sub.innerText()).replace(/\s+/g, ' ')
    ok('合计行含「总持仓金额」', subText.includes('总持仓金额'), subText.trim())

    // 数值与灰色
    const amtEl = page.locator('.wb-wl__sub .wb-wl__amount').first()
    const amtCount = await amtEl.count()
    if (amtCount) {
      const val = (await amtEl.innerText()).trim()
      ok('总持仓金额数值=2000.00', val === '2000.00', val)
      const color = await amtEl.evaluate((el) => getComputedStyle(el).color)
      // 低饱和度 = 中性灰（非红非绿）
      const m = color.match(/(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/)
      let gray = false
      if (m) {
        const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255]
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
        const l = (mx + mn) / 2
        const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
        gray = s < 0.35
      }
      ok('总持仓金额文字为中性灰(非红非绿)', gray, color)
    } else {
      ok('找到 .wb-wl__amount 元素', false, '未找到')
    }
  } catch (e) {
    results.push(`FAIL  脚本异常  (${e.message})`)
  } finally {
    await browser.close()
  }
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}  (${results.length} checks)`)
}
run()
