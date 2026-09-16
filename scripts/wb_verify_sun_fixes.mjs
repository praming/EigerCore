import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000/'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
function ok(name, cond, info = '') { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`) }

const run = async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', channel: 'msedge' })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => results.push(`FAIL  前端运行时异常  (${e.message})`))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    // 天气卡 → 太阳按钮（非编辑态）
    const weatherCard = page.locator('.wb-cell', { hasText: '天气' }).first()
    await weatherCard.waitFor({ state: 'visible', timeout: 8000 })
    const sunBtn = weatherCard.locator('.wb-weather-card__sun')
    await sunBtn.waitFor({ state: 'visible', timeout: 5000 })
    await sunBtn.click()
    await page.waitForTimeout(800)

    const modal = page.locator('.wb-sun-modal')
    ok('太阳弹窗打开', await modal.isVisible())

    // ===== ① 默认周视图：应显示「已走过」的日期（本周一..今天），不再整段无数据 =====
    await page.waitForSelector('.wb-sun-modal .wb-sun__row:not(.wb-sun__row--head)', { timeout: 6000 })
    const weekRows = modal.locator('.wb-sun__row:not(.wb-sun__row--head)')
    const wn = await weekRows.count()
    ok('周视图(本周)有数据行', wn >= 1, `rows=${wn}`)
    const wDl = (await weekRows.first().locator('span').nth(3).innerText()).trim()
    ok('周视图昼长中文格式(如 10小时8分)', /^\d+小时\d+分$/.test(wDl), wDl)

    // ===== ② 年视图：昼长中文 + 2 位小数；无水平滚动条 =====
    await modal.locator('.wb-sun__view', { hasText: '年' }).click()
    // 年视图拉取整年数据(252 天)需等待加载完成，再断言月份卡片
    await page.waitForSelector('.wb-sun-modal .wb-sun__mo', { timeout: 8000 })
    await page.waitForTimeout(300)
    const yearMonths = modal.locator('.wb-sun__mo')
    const mn = await yearMonths.count()
    ok('年视图有月份卡片', mn >= 1, `months=${mn}`)
    const dlText = (await yearMonths.first().locator('.wb-sun__mo-dl').innerText()).trim()
    ok('年视图昼长中文+2位小数(如 10小时7.96分)', /^\d+小时\d+\.\d{2}分$/.test(dlText), dlText)
    // 无水平滚动条（modal-box 为滚动容器）
    const overflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth)
    ok('年视图弹窗无水平滚动条', overflow <= 1, `scrollOverflow=${overflow}`)

    // ===== ③ 月视图（本月）：应显示截至今天的数据 =====
    await modal.locator('.wb-sun__view', { hasText: '月' }).click()
    await page.waitForTimeout(1000)
    await page.waitForSelector('.wb-sun-modal .wb-sun__row:not(.wb-sun__row--head)', { timeout: 6000 })
    const monthRows = modal.locator('.wb-sun__row:not(.wb-sun__row--head)')
    const mn2 = await monthRows.count()
    ok('月视图(本月)有数据行(截至今天)', mn2 >= 1, `rows=${mn2}`)
    const mDl = (await monthRows.first().locator('span').nth(3).innerText()).trim()
    ok('月视图昼长中文格式', /^\d+小时\d+分$/.test(mDl), mDl)

    console.log('\n' + results.join('\n'))
    const fails = results.filter((r) => r.startsWith('FAIL'))
    console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`)
    process.exit(fails.length ? 1 : 0)
  } catch (e) {
    console.error('SCRIPT ERROR', e)
    process.exit(2)
  } finally {
    await browser.close()
  }
}
run()
