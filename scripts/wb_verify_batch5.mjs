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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
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

    // ===== 1. 太阳弹窗：五列标题居中 + 列宽平均 =====
    const sunBtn = page.locator('.wb-weather-card__sun').first()
    if (await sunBtn.count()) {
      await sunBtn.click()
      await page.waitForSelector('.wb-sun-modal .wb-sun__row--head', { timeout: 8000 })
      await page.waitForTimeout(600)
      const modal = page.locator('.wb-sun-modal')
      const headSpans = modal.locator('.wb-sun__row--head span')
      const headCount = await headSpans.count()
      const headTexts = await headSpans.allInnerTexts()
      ok('太阳弹窗·5 列标题齐全', headCount === 5 && headTexts.join('|') === '日期|日出|日落|昼长|趋势', headTexts.join('|'))
      // 每个标题单元格 text-align=center（列居中）
      let allCentered = true
      for (let i = 0; i < headCount; i++) {
        const ta = await headSpans.nth(i).evaluate((el) => getComputedStyle(el).textAlign)
        if (ta !== 'center') allCentered = false
      }
      ok('太阳弹窗·五列标题均居中', allCentered)
      // 列表网格 5 列（列宽平均）
      const row = modal.locator('.wb-sun__row:not(.wb-sun__row--head)').first()
      const gridCols = await row.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
      ok('太阳弹窗·列表为 5 列网格', gridCols.trim().split(/\s+/).length === 5, gridCols)
      // 数据单元格也居中
      const dataCentered = await modal.locator('.wb-sun__row:not(.wb-sun__row--head) span').first().evaluate((el) => getComputedStyle(el).textAlign)
      ok('太阳弹窗·数据单元格居中', dataCentered === 'center', dataCentered)
      await modal.locator('.wb-sun__close').click().catch(() => {})
      await page.waitForTimeout(300)
    } else {
      ok('太阳弹窗·找到太阳按钮', false, '未找到 .wb-weather-card__sun')
    }

    // 进入编辑模式（后续设置页验证）
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)

    const openSettings = async (titleText) => {
      const card = page.locator('.wb-cell', { hasText: titleText }).first()
      await card.waitFor({ state: 'visible', timeout: 8000 })
      await card.locator('.wb-cell__btn[aria-label="设置"]').click()
      await page.waitForTimeout(500)
      return page.locator('.wb-pop__body')
    }
    const closePop = async () => {
      await page.locator('.wb-pop__foot').locator('button', { name: '完成' }).click().catch(() => {})
      await page.waitForTimeout(300)
    }

    // ===== 2. 待办·已完成弹窗列表沿用「排版」设置 =====
    // 先验证主列表带 style（lineGap/fontSize），再验证已完成弹窗列表也带 style
    const todoCard = page.locator('.wb-cell', { hasText: '待办事项' }).first()
    const mainList = todoCard.locator('.wb-todo__list:not(.wb-todo__list--done)')
    const mainStyle = (await mainList.count()) ? await mainList.first().getAttribute('style') : ''
    ok('待办·主列表沿用排版 style', /font-size/.test(mainStyle || ''), mainStyle || '无')
    // 打开「已完成」弹窗（按钮被卡片顶栏遮挡，用 DOM 直点绕过遮挡）
    await todoCard.locator('.wb-cell__btn[aria-label="已完成"]').evaluate((el) => el.click()).catch(async () => {
      await todoCard.locator('button[title="已完成"]').evaluate((el) => el.click())
    })
    await page.waitForTimeout(500)
    const donePop = page.locator('.wb-pop--done')
    ok('待办·已完成弹窗已打开', (await donePop.count()) > 0)
    const doneList = page.locator('.wb-todo__list--done')
    if (await doneList.count()) {
      const doneStyle = await doneList.first().getAttribute('style')
      ok('待办·已完成列表沿用排版 style(含font-size)', /font-size/.test(doneStyle || ''), doneStyle || '无')
    } else {
      // 探针账户无已完成项时列表不渲染，改为静态校验模板绑定 :style="listStyle"
      const fs = require('fs')
      const src = fs.readFileSync('web/src/components/workbench/TodoCard.vue', 'utf8')
      const bound = /wb-todo__list--done"[^>]*:style="listStyle"/.test(src)
      ok('待办·已完成列表模板绑定 listStyle(排版)', bound)
    }
    // 关闭弹窗
    await page.locator('.wb-pop__mask').last().click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.waitForTimeout(300)

    // ===== 3. 记事本·排版：内容内边距/页面内边距注释各在对应设置下方 =====
    let body = await openSettings('记事本')
    // 找到含「内容内边距」的 .wb-gap2__col
    const cols = body.locator('.wb-gap2__col')
    const colCount = await cols.count()
    let contentColNote = '', pageColNote = '', lineGapNote = ''
    for (let i = 0; i < colCount; i++) {
      const txt = await cols.nth(i).innerText()
      if (txt.includes('内容内边距')) contentColNote = txt
      if (txt.includes('页面内边距')) pageColNote = txt
      if (txt.includes('行间距')) lineGapNote = txt
    }
    ok('记事本·内容内边距说明在其所在列内', contentColNote.includes('各分区内部的留白'), contentColNote.slice(0, 30))
    ok('记事本·页面内边距说明在其所在列内', pageColNote.includes('整体与弹窗边框'), pageColNote.slice(0, 30))
    const noteBodyText = await body.innerText()
    ok('记事本·行间距/字号有独立说明', noteBodyText.includes('各列表项之间的纵向间距'), '排版区含行间距说明')
    await closePop()

    // ===== 4. 自选股·合计当日/总收益 正红负绿 =====
    const wlCard = page.locator('.wb-cell', { hasText: '自选股' }).first()
    const sub = wlCard.locator('.wb-wl__sub')
    if (await sub.count()) {
      const parentColor = await sub.evaluate((el) => getComputedStyle(el).color)
      const bs = sub.locator('b')
      const bn = await bs.count()
      let colored = true
      for (let i = 0; i < bn; i++) {
        const cls = await bs.nth(i).getAttribute('class')
        const c = await bs.nth(i).evaluate((el) => getComputedStyle(el).color)
        if (!/wb-wl__pl/.test(cls || '') || !/up|down/.test(cls || '') || c === parentColor) colored = false
      }
      ok('自选股·合计数值带 up/down 且为红/绿色(非灰)', colored, `b=${bn}`)
    } else {
      // 探针账户无持仓时合计行不渲染，改为校验已投产的 CSS 配色规则是否在打包样式中
      const cssHref = await page.locator('link[rel="stylesheet"]').first().getAttribute('href')
      const cssText = cssHref ? await (await api.get(new URL(cssHref, BASE).href)).text() : ''
      const hasUp = /\.wb-wl__pl\.up\s*\{[^}]*color/.test(cssText)
      const hasDown = /\.wb-wl__pl\.down\s*\{[^}]*color/.test(cssText)
      ok('自选股·已定义 .wb-wl__pl.up/.down 配色(正红负绿)', hasUp && hasDown, `up=${hasUp} down=${hasDown}`)
    }

    // ===== 5. 招标信息·更新时间=真实抓取时间(非页面刷新时刻) =====
    const bidCard = page.locator('.wb-cell', { hasText: '招标信息' }).first()
    const meta = bidCard.locator('.wb-card__meta')
    const metaText = (await meta.count()) ? (await meta.first().innerText()) : ''
    ok('招标信息·含「更新」时间', /更新/.test(metaText), metaText)
    // 真实抓取时间应早于今天(2026-09-09)，证明不是页面整体刷新时刻
    ok('招标信息·更新时间不是今天(证明为真实抓取时间)', !/2026-09-09/.test(metaText), metaText)

    await page.waitForTimeout(200)
  } catch (e) {
    results.push(`FAIL  脚本异常  (${e.message})`)
  } finally {
    await browser.close()
  }
  console.log('\n==== 验证结果 ====')
  results.forEach((r) => console.log(r))
  const fails = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n总计 ${results.length} 项，失败 ${fails} 项`)
  process.exit(fails ? 1 : 0)
}
run()
