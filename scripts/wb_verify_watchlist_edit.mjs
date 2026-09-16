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

    // 种子：一只持仓，带 id 便于回读
    const seed = {
      state: {
        prefs: {
          watchlist: {
            holdings: [
              { id: 9001, code: '600519', name: '贵州茅台', buyPrice: 1500, shares: 100, prevClose: 1680, current: 1700, costDate: '2025-01-15' },
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

    // 打开自选股设置页
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)
    const gear = page.locator('.wb-cell', { hasText: '自选股' }).first().locator('.wb-cell__btn[aria-label="设置"]')
    await gear.click()
    await page.waitForTimeout(500)

    // 找到 600519 行，点编辑（pencil）
    const row = page.locator('.wb-pop__body').locator('.wb-wl__row', { hasText: '600519' })
    await row.waitFor({ state: 'visible', timeout: 5000 })
    await row.locator('button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)

    // 表单预填校验
    const codeVal = await page.locator('.wb-row', { hasText: '代码' }).locator('input').inputValue()
    const buyVal = await page.locator('.wb-row', { hasText: '买入价' }).locator('input').inputValue()
    const dateVal = await page.locator('.wb-row', { hasText: '建仓日期' }).locator('input').inputValue()
    ok('编辑时代码预填', codeVal === '600519', `code=${codeVal}`)
    ok('编辑时买入价预填', buyVal === '1500', `buyPrice=${buyVal}`)
    ok('编辑时建仓日期预填', dateVal === '2025-01-15', `costDate=${dateVal}`)

    const saveLabel = await page.getByRole('button', { name: '保存修改' }).count()
    ok('按钮变为「保存修改」', saveLabel === 1, `count=${saveLabel}`)
    const capTxt = await page.locator('.wb-pop__body').innerText()
    ok('显示正在编辑提示', capTxt.includes('正在编辑') && capTxt.includes('贵州茅台'), capTxt.includes('正在编辑') ? '含提示' : '无提示')

    // 修改买入价 + 建仓日期，保存
    await page.locator('.wb-row', { hasText: '买入价' }).locator('input').fill('1688')
    await page.locator('.wb-row', { hasText: '建仓日期' }).locator('input').fill('2026-03-20')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: '保存修改' }).click()
    await page.waitForTimeout(700)

    // 保存后：列表项显示新买入价；按钮回到「添加持仓」；提示消失
    const bodyTxt = await page.locator('.wb-pop__body').innerText()
    ok('保存后列表显示新买入价', bodyTxt.includes('1688'), bodyTxt.includes('1688') ? '含1688' : '无1688')
    const addLabel = await page.getByRole('button', { name: '添加持仓' }).count()
    ok('保存后按钮回到「添加持仓」', addLabel === 1, `count=${addLabel}`)
    const capAfter = await page.locator('.wb-pop__body').innerText()
    ok('保存后编辑提示消失', !capAfter.includes('正在编辑'), capAfter.includes('正在编辑') ? '仍有提示' : '已消失')

    // 服务端落库校验
    await page.waitForTimeout(1600)
    const st = await api.get(BASE + 'api/workbench/state')
    const sb = await st.json()
    const h = ((sb.state && sb.state.prefs && sb.state.prefs.watchlist && sb.state.prefs.watchlist.holdings) || []).find((x) => x.id === 9001)
    ok('服务端买入价更新', h && h.buyPrice === 1688, h ? `buyPrice=${h.buyPrice}` : 'no holding')
    ok('服务端建仓日期更新', h && h.costDate === '2026-03-20', h ? `costDate=${h.costDate}` : 'no holding')
    ok('服务端代码未变', h && h.code === '600519', h ? `code=${h.code}` : 'no holding')

    // 取消测试：再次编辑，改代码，点取消
    const row2 = page.locator('.wb-pop__body').locator('.wb-wl__row', { hasText: '600519' })
    await row2.locator('button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)
    await page.locator('.wb-row', { hasText: '代码' }).locator('input').fill('600518')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: '取消' }).click()
    await page.waitForTimeout(400)
    const codeAfter = await page.locator('.wb-row', { hasText: '代码' }).locator('input').inputValue()
    ok('取消后表单清空', codeAfter === '', `code=${codeAfter}`)
    const addLabel2 = await page.getByRole('button', { name: '添加持仓' }).count()
    ok('取消后按钮回到「添加持仓」', addLabel2 === 1, `count=${addLabel2}`)
    const stillThere = await page.locator('.wb-pop__body').locator('.wb-wl__row', { hasText: '600519' }).count()
    ok('取消不影响原持仓', stillThere === 1, `rows=${stillThere}`)

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
