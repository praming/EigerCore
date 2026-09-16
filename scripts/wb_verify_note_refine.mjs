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
    const csrf = await (await api.get('http://127.0.0.1:5000/api/csrf-token')).json()
    const loginRes = await api.post('http://127.0.0.1:5000/api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const items = page.locator('.wb-note__item')
    if (await items.count() === 0) {
      await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
      await page.waitForTimeout(300)
      await page.locator('.wb-pop--note input.wb-input').first().fill('验证笔记')
      await page.locator('.wb-pop--note textarea.wb-note').fill('内容正文用于测试铺满高度')
      await page.getByRole('button', { name: '保存' }).click()
      await page.waitForTimeout(400)
    }

    // —— 详情页：去掉「记事」二字，头部显示 标题 + 日期 同行 ——
    await items.first().click()
    await page.waitForTimeout(400)
    const detail = page.locator('.wb-pop--note')
    ok('详情弹窗打开', await detail.count() > 0)
    const headTxt = await detail.locator('.wb-pop__head').innerText()
    ok('详情头部无「记事」二字', !headTxt.includes('记事'), `head="${headTxt.replace(/\n/g, ' ')}"`)
    const hasHead = await detail.locator('.wb-note__head').count()
    ok('头部含 .wb-note__head 容器', hasHead > 0)
    const titleDate = await detail.evaluate((el) => {
      const t = el.querySelector('.wb-note__head-title')
      const d = el.querySelector('.wb-note__head-date')
      if (!t || !d) return null
      const tr = t.getBoundingClientRect(), dr = d.getBoundingClientRect()
      return { tTop: tr.top, dTop: dr.top, tTxt: t.textContent, dTxt: d.textContent }
    })
    ok('头部同时含 标题与日期', !!titleDate && !!titleDate.tTxt && !!titleDate.dTxt, titleDate ? `title=${titleDate.tTxt} date=${titleDate.dTxt}` : 'null')
    ok('标题与日期同一行(基线对齐)', !!titleDate && Math.abs(titleDate.tTop - titleDate.dTop) < 8, titleDate ? `Δtop=${(titleDate.tTop - titleDate.dTop).toFixed(1)}` : '')
    const bodyHasTitle = await detail.locator('.wb-note__detail-title').count()
    const bodyHasMeta = await detail.locator('.wb-note__detail-meta').count()
    ok('正文区不再含独立标题/日期', bodyHasTitle === 0 && bodyHasMeta === 0, `title=${bodyHasTitle} meta=${bodyHasMeta}`)

    // —— 内边距增大（>=20px）——
    const pad = await detail.evaluate((el) => {
      const b = el.querySelector('.wb-pop__body')
      return parseFloat(getComputedStyle(b).paddingLeft)
    })
    ok('详情正文内边距增大(>=20px)', pad >= 20, `paddingLeft=${pad.toFixed(1)}px`)

    // 关闭详情
    await detail.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // —— 新建：内容框铺满剩余高度 ——
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    const createPop = page.locator('.wb-pop--note')
    const fill = await createPop.evaluate((el) => {
      const body = el.querySelector('.wb-pop__body').getBoundingClientRect()
      const ta = el.querySelector('textarea.wb-note').getBoundingClientRect()
      return { bodyBottom: body.bottom, taBottom: ta.bottom, bodyTop: body.top, taTop: ta.top, bodyH: body.height, taH: ta.height }
    })
    ok('新建内容框铺满剩余高度(底部贴合)', (fill.bodyBottom - fill.taBottom) < 30, `gap=${(fill.bodyBottom - fill.taBottom).toFixed(1)}px`)
    ok('新建内容框占正文大部分高度(>40%)', fill.taH / fill.bodyH > 0.4, `ratio=${(fill.taH / fill.bodyH).toFixed(2)}`)
    await createPop.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // —— 设置页开关 + 遮罩点击行为 ——
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.click()
    await page.waitForTimeout(400)
    const noteGear = page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]')
    ok('记事本卡片设置齿轮存在', await noteGear.count() > 0)
    await noteGear.first().click()
    await page.waitForTimeout(400)
    const sw = page.locator('.wb-opt', { hasText: '点击遮罩关闭弹窗' }).locator('button.wb-switch')
    ok('设置页含「点击遮罩关闭弹窗」开关', await sw.count() > 0)
    const readSw = async () => (await sw.getAttribute('aria-checked')) === 'true'
    const s0 = await readSw()
    // 确保为 ON
    if (!s0) { await sw.click(); await page.waitForTimeout(300) }
    ok('开关默认/置为 开启', await readSw())

    // 关闭设置 + 退出编辑 → 测试 ON 时遮罩点击关闭
    await page.locator('.wb-pop__mask').last().locator('button[aria-label="关闭"]').click().catch(async () => {
      await page.keyboard.press('Escape')
    })
    await page.waitForTimeout(300)
    await editBtn.click()
    await page.waitForTimeout(300)

    await items.first().click()
    await page.waitForTimeout(400)
    let d2 = page.locator('.wb-pop--note')
    ok('(ON) 详情打开', await d2.count() > 0)
    await page.locator('.wb-pop__mask').click({ position: { x: 4, y: 4 } })
    await page.waitForTimeout(400)
    ok('(ON) 点击遮罩外关闭弹窗', await page.locator('.wb-pop--note').count() === 0, `remain=${await page.locator('.wb-pop--note').count()}`)

    // 回到设置，关掉开关 → 测试 OFF 时遮罩点击不关闭
    await editBtn.click()
    await page.waitForTimeout(300)
    await page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]').first().click()
    await page.waitForTimeout(300)
    const sw2 = page.locator('.wb-opt', { hasText: '点击遮罩关闭弹窗' }).locator('button.wb-switch')
    await sw2.click()
    await page.waitForTimeout(300)
    ok('开关已关闭', !(await readSw2(sw2)))
    await page.locator('.wb-pop__mask').last().locator('button[aria-label="关闭"]').click().catch(() => {})
    await page.waitForTimeout(300)
    await editBtn.click()
    await page.waitForTimeout(300)

    await items.first().click()
    await page.waitForTimeout(400)
    ok('(OFF) 详情打开', await page.locator('.wb-pop--note').count() > 0)
    await page.locator('.wb-pop__mask').click({ position: { x: 4, y: 4 } })
    await page.waitForTimeout(400)
    ok('(OFF) 点击遮罩外不关闭弹窗', await page.locator('.wb-pop--note').count() === 1, `remain=${await page.locator('.wb-pop--note').count()}`)
    // 清理：恢复开关为 ON
    await page.locator('.wb-pop--note').locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(200)
    await editBtn.click()
    await page.waitForTimeout(300)
    await page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]').first().click()
    await page.waitForTimeout(300)
    const sw3 = page.locator('.wb-opt', { hasText: '点击遮罩关闭弹窗' }).locator('button.wb-switch')
    if (!(await readSw2(sw3))) { await sw3.click(); await page.waitForTimeout(300) }
    ok('已恢复开关为 开启', await readSw2(sw3))

    console.log('\n==== 记事本 内边距/头部/遮罩开关 验证 ====')
    console.log(results.join('\n'))
    const failed = results.filter((r) => r.startsWith('FAIL'))
    console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
    await browser.close()
    process.exit(failed.length ? 1 : 0)
  } catch (e) {
    console.log(results.join('\n'))
    console.error('ERROR', e)
    await browser.close()
    process.exit(2)
  }
}
async function readSw2(loc) { return (await loc.getAttribute('aria-checked')) === 'true' }
run()
