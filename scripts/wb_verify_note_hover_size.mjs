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
    const csrfRes = await api.get('http://127.0.0.1:5000/api/csrf-token')
    const csrf = await csrfRes.json()
    const loginRes = await api.post('http://127.0.0.1:5000/api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const list = page.locator('.wb-notes__list')
    ok('记事列表存在', await list.count() > 0)
    let items = page.locator('.wb-note__item')
    if (await items.count() === 0) {
      await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
      await page.waitForTimeout(300)
      await page.locator('.wb-pop--note input.wb-input').first().fill('验证笔记')
      await page.locator('.wb-pop--note textarea.wb-note').fill('内容')
      await page.getByRole('button', { name: '保存' }).click()
      await page.waitForTimeout(400)
      items = page.locator('.wb-note__item')
    }
    ok('至少 1 条笔记', await items.count() > 0, `count=${await items.count()}`)

    // —— 悬浮：仅标题变色，无背景色 ——
    const first = items.first()
    await first.hover()
    await page.waitForTimeout(250)
    const hover = await first.evaluate((el) => {
      const cs = getComputedStyle(el)
      const title = el.querySelector('.wb-note__title')
      const titleCs = getComputedStyle(title)
      // 计算主色 rgb
      const probe = document.createElement('span')
      probe.style.color = 'hsl(var(--p))'
      document.body.appendChild(probe)
      const primary = getComputedStyle(probe).color
      document.body.removeChild(probe)
      return { bg: cs.backgroundColor, titleColor: titleCs.color, primary }
    })
    ok('悬浮无背景色(transparent)', hover.bg === 'rgba(0, 0, 0, 0)', `bg=${hover.bg}`)
    ok('悬浮标题变为主色', hover.titleColor === hover.primary, `title=${hover.titleColor} primary=${hover.primary}`)

    // —— 详情弹窗尺寸（PC：50vw × 66.666vh）——
    await first.click()
    await page.waitForTimeout(400)
    const detail = page.locator('.wb-pop--note')
    ok('详情弹窗含 wb-pop--note', await detail.count() > 0)
    const dSize = await detail.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })
    const vw = 1280, vh = 720
    const wRatio = dSize.w / vw, hRatio = dSize.h / vh
    ok('详情宽≈1/2屏(0.5)', Math.abs(wRatio - 0.5) < 0.03, `w=${dSize.w.toFixed(0)} ratio=${wRatio.toFixed(2)}`)
    ok('详情高≈2/3屏(0.666)', Math.abs(hRatio - 0.666) < 0.04, `h=${dSize.h.toFixed(0)} ratio=${hRatio.toFixed(2)}`)

    // 详情右上角：编辑 / 删除 / 关闭 三图标
    const headBtns = detail.locator('.wb-card__right .wb-cell__btn')
    const labels = await headBtns.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    ok('详情头部含 编辑/删除/关闭', ['编辑', '删除', '关闭'].every((l) => labels.includes(l)), `labels=${labels.join(',')}`)

    // 进入编辑，验证编辑页同尺寸
    await detail.locator('button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)
    const eSize = await detail.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })
    ok('编辑页同尺寸(宽1/2)', Math.abs(eSize.w / vw - 0.5) < 0.03, `w=${eSize.w.toFixed(0)}`)
    ok('编辑页同尺寸(高2/3)', Math.abs(eSize.h / vh - 0.666) < 0.04, `h=${eSize.h.toFixed(0)}`)
    await detail.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // —— 新建弹窗尺寸（PC：50vw × 66.666vh）——
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    const createPop = page.locator('.wb-pop--note')
    const cSize = await createPop.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })
    ok('新建页宽≈1/2屏', Math.abs(cSize.w / vw - 0.5) < 0.03, `w=${cSize.w.toFixed(0)}`)
    ok('新建页高≈2/3屏', Math.abs(cSize.h / vh - 0.666) < 0.04, `h=${cSize.h.toFixed(0)}`)
    await createPop.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(200)

    // —— 移动端：宽高占满屏幕 ——
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(300)
    await items.first().click()
    await page.waitForTimeout(400)
    const mSize = await detail.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })
    const mvw = 390, mvh = 844
    ok('移动端宽≈满屏', Math.abs(mSize.w / mvw - 1) < 0.02, `w=${mSize.w.toFixed(0)} ratio=${(mSize.w/mvw).toFixed(2)}`)
    ok('移动端高≈满屏', Math.abs(mSize.h / mvh - 1) < 0.02, `h=${mSize.h.toFixed(0)} ratio=${(mSize.h/mvh).toFixed(2)}`)

    console.log('\n==== 记事本 悬浮/尺寸验证 ====')
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
run()
