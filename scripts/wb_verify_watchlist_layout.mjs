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
    page.on('console', () => {})

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const loginRes = await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    // 种子：两只持仓，带现价/昨收/建仓日期（无需联网）
    const seed = {
      state: {
        prefs: {
          watchlist: {
            holdings: [
              { id: 9001, code: '600519', name: '贵州茅台', buyPrice: 1500, shares: 100, prevClose: 1680, current: 1700, costDate: '2025-01-15' },
              { id: 9002, code: '000001', name: '平安银行', buyPrice: 12, shares: 1000, prevClose: 11.5, current: 11.2, costDate: '2025-03-20' },
            ],
            autoRefresh: { enabled: false, interval: 60 },
          },
        },
      },
    }
    const putRes = await api.put(BASE + 'api/workbench/state', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: seed,
    })
    ok('种子写入成功', putRes.ok() && putRes.status() === 200, `status=${putRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // 定位自选股卡片内的 .wb-wl
    const wl = page.locator('.wb-wl').first()
    await wl.waitFor({ state: 'visible', timeout: 5000 })
    const rows = wl.locator('.wb-wl__row')
    const rowCount = await rows.count()
    ok('至少两只股票', rowCount >= 2, `rows=${rowCount}`)

    // 1) 取消边框：每行四周（左/右/下）无边框；第2行起允许顶部水平分隔线
    for (let i = 0; i < rowCount; i++) {
      const sides = await rows.nth(i).evaluate((el) => { const s = getComputedStyle(el); return { l: s.borderLeftWidth, r: s.borderRightWidth, b: s.borderBottomWidth } })
      ok(`第${i + 1}行无四周边框`, sides.l === '0px' && sides.r === '0px' && sides.b === '0px', JSON.stringify(sides))
    }
    // 2) 水平分隔线：第 2 行起有 border-top
    const top1 = await rows.nth(1).evaluate((el) => getComputedStyle(el).borderTopWidth)
    ok('股票间有水平分隔线', parseFloat(top1) > 0, `borderTopWidth=${top1}`)

    // 3) 两行结构：每只股票有 line1 + line2
    const r0 = rows.nth(0)
    ok('第1行含 line1', (await r0.locator('.wb-wl__line1').count()) === 1)
    ok('第1行含 line2', (await r0.locator('.wb-wl__line2').count()) === 1)
    // 行1左：名称+代码；行1右：买入/持仓/金额/建仓
    const nameTxt = await r0.locator('.wb-wl__name').innerText()
    ok('行1左显示名称+代码', nameTxt.includes('贵州茅台') && nameTxt.includes('600519'), nameTxt.replace(/\n/g, ' '))
    const posTxt = await r0.locator('.wb-wl__pos').innerText()
    ok('行1右含 买入/持仓/金额/建仓', posTxt.includes('买入') && posTxt.includes('持仓') && posTxt.includes('金额') && posTxt.includes('建仓'), posTxt.replace(/\n/g, ' '))
    ok('显示建仓日期', posTxt.includes('2025-01-15'), posTxt.replace(/\n/g, ' '))
    // 金额 = 1500*100 = 150000.00
    ok('持仓金额=买入价×股数', posTxt.includes('150,000.00') || posTxt.includes('150000.00'), posTxt.replace(/\n/g, ' '))

    // 4) 行2：5 个子项，space-between 撑满整行
    const lv = r0.locator('.wb-wl__line2 .wb-wl__lv')
    const lvCount = await lv.count()
    ok('行2含5个指标', lvCount === 5, `count=${lvCount}`)
    const lineBox = await r0.locator('.wb-wl__line2').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width } })
    const firstBox = await lv.nth(0).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right } })
    const lastBox = await lv.nth(lvCount - 1).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right } })
    ok('行2撑满：首项贴左', Math.abs(firstBox.left - lineBox.left) <= 2, `firstLeft=${firstBox.left.toFixed(1)} lineLeft=${lineBox.left.toFixed(1)}`)
    ok('行2撑满：末项贴右', Math.abs(lastBox.right - lineBox.right) <= 2, `lastRight=${lastBox.right.toFixed(1)} lineRight=${lineBox.right.toFixed(1)}`)
    const lvTxt = await r0.locator('.wb-wl__line2').innerText()
    ok('行2含 现价/日涨跌/涨跌幅/总收益/收益率', ['现价','日涨跌','涨跌幅','总收益','收益率'].every((t) => lvTxt.includes(t)), lvTxt.replace(/\n/g, ' '))
    // 行2 不溢出卡片（首项贴左、末项不超过卡片右缘）
    const wlBox = await wl.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right } })
    ok('行2首项贴左', Math.abs(firstBox.left - wlBox.left) <= 2, `firstLeft=${firstBox.left.toFixed(1)} wlLeft=${wlBox.left.toFixed(1)}`)
    ok('行2不溢出卡片', lastBox.right <= wlBox.right + 1 && firstBox.left >= wlBox.left - 1, `lastRight=${lastBox.right.toFixed(1)} wlRight=${wlBox.right.toFixed(1)}`)

    // 5) 设置页：建仓日期 date 输入存在
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)
    const gear = page.locator('.wb-cell', { hasText: '自选股' }).first().locator('.wb-cell__btn[aria-label="设置"]')
    await gear.click()
    await page.waitForTimeout(500)
    const dateInputs = page.locator('input[type="date"]')
    ok('设置页含建仓日期输入', (await dateInputs.count()) >= 1, `dateInputs=${await dateInputs.count()}`)
    const dateLabels = await page.locator('.wb-row label').allInnerTexts()
    ok('存在「建仓日期」标签', dateLabels.some((t) => t.includes('建仓日期')), dateLabels.join(','))
    // 在「添加持仓」表单填 建仓日期 并提交，验证落库（设置页建仓日期属新增表单）
    const codeInput = page.locator('.wb-row', { hasText: '代码' }).locator('input')
    await codeInput.fill('300750')
    await page.locator('.wb-row', { hasText: '买入价' }).locator('input').fill('200')
    await page.locator('.wb-row', { hasText: '股数' }).locator('input').fill('10')
    await dateInputs.first().fill('2026-05-01')
    await dateInputs.first().dispatchEvent('change')
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '添加持仓' }).click()
    await page.waitForTimeout(600)
    // UI 列表应出现新持仓且显示建仓日期
    const listTxt = await page.locator('.wb-pop__body').innerText()
    ok('新建持仓出现在设置列表', listTxt.includes('300750') && listTxt.includes('2026-05-01'), listTxt.includes('300750') ? '列表含300750' : '列表无300750')
    // 服务端同步（防抖）后复查
    await page.waitForTimeout(1600)
    const st = await api.get(BASE + 'api/workbench/state')
    const body = await st.json()
    const newHold = ((body.state && body.state.prefs && body.state.prefs.watchlist && body.state.prefs.watchlist.holdings) || []).find((h) => h.code === '300750')
    ok('新建持仓建仓日期落库', newHold && newHold.costDate === '2026-05-01', newHold ? `costDate=${newHold.costDate}` : 'no holding')

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
