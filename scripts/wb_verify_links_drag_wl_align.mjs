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
    await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })

    const seed = {
      state: {
        prefs: {
          links: {
            items: [
              { id: 9101, title: 'LinkA', url: 'https://a.test', icon: 'link' },
              { id: 9102, title: 'LinkB', url: 'https://b.test', icon: 'github' },
              { id: 9103, title: 'LinkC', url: 'https://c.test', icon: 'star' },
            ],
          },
          watchlist: {
            holdings: [
              { id: 9201, code: '600519', name: '贵州茅台', buyPrice: 1500, shares: 100, prevClose: 1680, current: 1700, costDate: '2025-01-15' },
              { id: 9202, code: '000001', name: '平安银行', buyPrice: 12, shares: 200, prevClose: 11, current: 12, costDate: '' },
            ],
            autoRefresh: { enabled: false, interval: 60 },
          },
        },
      },
    }
    await api.put(BASE + 'api/workbench/state', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: seed,
    })

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)

    // ===== 常用链接：拖拽 + 上传美化 =====
    await page.locator('.wb-cell', { hasText: '常用链接' }).first().locator('.wb-cell__btn[aria-label="设置"]').click()
    await page.waitForTimeout(500)
    const lrows = page.locator('.wb-pop__body').locator('.wb-lk__row')
    ok('链接行有拖拽柄', (await lrows.first().locator('.wb-lk__handle').count()) === 1)
    const draggable = await lrows.first().getAttribute('draggable')
    ok('链接行 draggable=true', draggable === 'true', `draggable=${draggable}`)
    const fileLabel = page.locator('.wb-pop__body').locator('.wb-file')
    ok('上传按钮美化(.wb-file)', (await fileLabel.count()) === 1)
    ok('原生 file input 隐藏', await fileLabel.locator('input.wb-file__input').isHidden())

    // 模拟 HTML5 拖拽：把第 1 行拖到第 3 行位置
    const beforeFirst = await lrows.first().locator('.wb-lk__title').innerText()
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.wb-pop__body .wb-lk__row'))
      const r1 = rows[0], r3 = rows[2]
      const dt = new DataTransfer()
      r1.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      r3.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
      r1.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    })
    await page.waitForTimeout(400)
    const afterRows = page.locator('.wb-pop__body').locator('.wb-lk__row')
    const newFirst = await afterRows.first().locator('.wb-lk__title').innerText()
    ok('拖拽后顺序变化', newFirst !== beforeFirst, `before=${beforeFirst} after=${newFirst}`)

    await page.waitForTimeout(1600)
    const st = await api.get(BASE + 'api/workbench/state')
    const sb = await st.json()
    const items = (sb.state?.prefs?.links?.items) || []
    ok('拖拽后服务端顺序更新', items[0]?.id === 9102 || items[0]?.id === 9103, `firstId=${items[0]?.id}`)
    ok('链接总数不变', items.length === 3, `len=${items.length}`)

    // ===== 自选股：行1 列对齐（在卡片主视图，非设置弹窗）=====
    await page.locator('.wb-pop__foot').locator('button', { name: '完成' }).click()
    await page.waitForTimeout(400)
    // 退出编辑态，确保卡片正常渲染
    const exitEdit = page.locator('button[aria-label="退出编辑"]')
    if (await exitEdit.count()) { await exitEdit.first().click(); await page.waitForTimeout(300) }
    const pos = page.locator('.wb-wl__pos').first()
    await pos.waitFor({ state: 'visible', timeout: 5000 })
    const disp = await pos.evaluate((el) => getComputedStyle(el).display)
    ok('持仓区为 grid', disp === 'grid', `display=${disp}`)
    const cols = await pos.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    const trackCount = cols.trim().split(/\s+/).length
    ok('持仓区 4 列', trackCount === 4, `cols="${cols}" tracks=${trackCount}`)
    // 无建仓日期的持仓也应显示「建仓」列（含 —）
    const cardRows = page.locator('.wb-wl__row')
    let foundNoCost = false
    const n = await cardRows.count()
    for (let i = 0; i < n; i++) {
      const t = await cardRows.nth(i).innerText()
      if (t.includes('平安银行')) { foundNoCost = t.includes('建仓'); break }
    }
    ok('无建仓日期也显示建仓列', foundNoCost)

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
