import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000/'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
function ok(name, cond, info = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`)
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    channel: 'msedge',
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    page.on('console', () => {})
    page.on('pageerror', (e) => results.push(`FAIL  前端运行时异常  (${e.message})`))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    await api.put(BASE + 'api/workbench/state', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { state: { prefs: { weather: { city: '郑州' } } } },
    })
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    const wxCard = page.locator('.wb-weather-card').first()
    await wxCard.waitFor({ state: 'visible', timeout: 8000 })
    const sunBtn = wxCard.locator('.wb-weather-card__sun')
    await sunBtn.click()
    await page.waitForTimeout(600)
    const modal = page.locator('.wb-sun-modal')
    ok('太阳弹窗(.wb-sun-modal)打开', (await modal.count()) === 1 && (await modal.isVisible()))

    // ===== 1. 下拉框美化：去原生外观 + 自定义箭头 =====
    const selInfo = await page.evaluate(() => {
      const s = document.querySelector('.wb-sun-modal .wb-sun__sel')
      if (!s) return null
      const cs = getComputedStyle(s)
      return { appearance: cs.appearance, bg: cs.backgroundImage }
    })
    ok('下拉框 appearance=none（去原生外观）', selInfo && selInfo.appearance === 'none', selInfo ? selInfo.appearance : 'null')
    ok('下拉框带自定义 chevron 背景', selInfo && selInfo.bg && selInfo.bg.includes('svg'), selInfo ? selInfo.bg.slice(0, 40) : '')

    // ===== 2. 周视图：列表含第 5 列「趋势」+ 柱状条 =====
    const headSpans = await modal.locator('.wb-sun__row--head span').allInnerTexts()
    ok('周视图表头为 5 列(含「趋势」)', headSpans.length === 5 && headSpans.includes('趋势'), headSpans.join('|'))
    const weekRows = modal.locator('.wb-sun__row:not(.wb-sun__row--head)')
    const weekN = await weekRows.count()
    ok('周视图有数据行', weekN >= 1, `rows=${weekN}`)
    const weekBars = modal.locator('.wb-sun__row:not(.wb-sun__row--head) .wb-sun__bar')
    ok('每行含柱状条(.wb-sun__bar)', (await weekBars.count()) === weekN, `bars=${await weekBars.count()}`)
    const weekWidths = await modal.locator('.wb-sun__row:not(.wb-sun__row--head) .wb-sun__bar i').evaluateAll((els) =>
      els.map((e) => parseFloat((e.style.width || '0').replace('%', ''))),
    )
    ok('周视图柱状条宽度>0', weekWidths.length > 0 && weekWidths.every((w) => w > 0), `[${weekWidths.join(',')}]`)

    // ===== 3. 月视图（历史月）：柱状条比例随昼长变化 =====
    await modal.locator('.wb-sun__view', { hasText: '月' }).click()
    await page.waitForTimeout(400)
    await modal.locator('.wb-sun__sel').nth(0).selectOption({ value: '2024' }, { timeout: 5000 })
    await page.waitForFunction(
      () => {
        const s = document.querySelectorAll('.wb-sun-modal .wb-sun__sel')
        return s.length >= 2 && s[1] && s[1].querySelector('option[value="6"]')
      },
      { timeout: 5000 },
    ).catch(() => {})
    await modal.locator('.wb-sun__sel').nth(1).selectOption({ value: '6' }, { timeout: 5000 })
    await page.waitForSelector('.wb-sun__row:not(.wb-sun__row--head) .wb-sun__bar', { timeout: 8000 })
    await page.waitForTimeout(500)
    const rows = await modal.locator('.wb-sun__row:not(.wb-sun__row--head)').evaluateAll((els) =>
      els.map((el) => {
        const spans = el.querySelectorAll('span')
        const dlText = spans[3] ? spans[3].textContent || '' : ''
        const m = dlText.match(/(\d+)小时(\d+(?:\.\d+)?)分/)
        const dl = m ? parseInt(m[1], 10) * 60 + parseFloat(m[2]) : null
        const bar = el.querySelector('.wb-sun__bar i')
        const w = bar ? parseFloat((bar.style.width || '0').replace('%', '')) : null
        return { dl, w }
      }),
    )
    const valid = rows.filter((r) => r.dl != null && r.w != null)
    ok('月视图(2024-06)柱状条已渲染', valid.length >= 28, `bars=${valid.length}`)
    const maxW = Math.max(...valid.map((r) => r.w))
    const minW = Math.min(...valid.map((r) => r.w))
    // 最长昼长对应最宽柱（比例绘制正确性，不依赖月份跨度）
    const maxDlRow = valid.reduce((a, b) => (b.dl > a.dl ? b : a))
    ok('最长昼长=最宽柱(比例正确)', Math.abs(maxDlRow.w - maxW) < 0.5, `maxDl=${maxDlRow.dl}min w=${maxDlRow.w}`)
    // 宽度随昼长单调不减（barPct 正比于昼长）
    const sorted = [...valid].sort((a, b) => a.dl - b.dl)
    const mono = sorted.every((r, i) => i === 0 || r.w >= sorted[i - 1].w - 0.5)
    ok('柱状条宽度随昼长单调不减', mono, `max=${maxW} min=${minW}`)
    ok('最长昼长柱≈100%', maxW >= 90, `max=${maxW}`)
    ok('最短昼长柱≥8%(可见下限)', minW >= 8, `min=${minW}`)

    // ===== 4. 无水平滚动条（新增列未撑破）=====
    const scrollOverflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth)
    ok('太阳弹窗无水平滚动条', scrollOverflow <= 0, `overflow=${scrollOverflow}`)

    await browser.close()
  } catch (e) {
    results.push(`FAIL  脚本异常  (${e.message})`)
    try { await browser.close() } catch {}
  }
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n=== ${results.length - failed}/${results.length} PASS ===`)
  process.exit(failed ? 1 : 0)
}
run()
