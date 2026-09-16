// 真机验证：每日一言（严格按间隔） + 工具箱（11 工具 / 标题开关 / 间距 / 拖拽排序）
// 用 playwright-core（workspace node_modules）+ 系统 Edge channel='msedge'，无头。
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe4'
const PASS = 'probe1234'

const results = []
const log = (ok, step, detail) => {
  results.push({ ok, step, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('wb_state_v1') || '{}'))
const readQuoteCache = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('wb_quote_v1') || '{}'))
const isEdit = (page) =>
  page.evaluate(() => !!document.querySelector('button[aria-label="退出编辑"]'))
async function enterEdit(page) {
  if (!(await isEdit(page))) { await page.click('button[aria-label="编辑工作台布局"]'); await page.waitForTimeout(300) }
}
async function exitEdit(page) {
  if (await isEdit(page)) { await page.click('button[aria-label="退出编辑"]'); await page.waitForTimeout(300) }
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })

try {
  // 1) 登录（SPA 免 CSRF：POST /api/login，session 写入 context cookie）
  const loginRes = await page.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: USER, password: PASS, remember: true }),
  })
  const loginJson = await loginRes.json()
  log(loginJson.status === 'ok', 'login', `status=${loginJson.status}`)

  // 2) 进入工作台（default_view=workbench）
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-grid', { timeout: 15000 })
  await page.waitForSelector('.wb-quote__text', { timeout: 15000 })
  log(true, 'load-workbench', '工作台渲染完成')

  // ===== 测试 A：每日一言 严格按间隔（确定性，不依赖网络）=====
  // 预置缓存：模拟「上次已换句且未过间隔」，reload 后必须显示同一句（不随机、不重新拉取）
  const SEED = { text: 'SEED_名言_请勿随机', author: 'SEED_作者', at: Date.now() }
  await page.evaluate((s) => localStorage.setItem('wb_quote_v1', JSON.stringify(s)), SEED)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-quote__text', { timeout: 15000 })
  const qSeed = (await page.textContent('.wb-quote__text')).trim()
  log(qSeed === SEED.text, 'quote-strict-interval', `reload 后仍显示预置缓存（不随机）: q="${qSeed}"`)

  // 进入编辑模式，打开一言齿轮，核对 8 档间隔选项
  await enterEdit(page)
  await page.click('.wb-quote__gear')
  await page.waitForSelector('.wb-quote__pop', { timeout: 5000 })
  const optCount = await page.locator('.wb-quote__opt').count()
  const optLabels = await page.locator('.wb-quote__opt').allTextContents()
  log(optCount === 8 && optLabels.includes('1 分钟') && optLabels.includes('6 小时') && optLabels.includes('12 小时') && optLabels.includes('24 小时'),
    'quote-8-intervals', `count=${optCount} labels=${JSON.stringify(optLabels)}`)
  // 切到 1 分钟并确认持久化
  await page.click('.wb-quote__opt:has-text("1 分钟")')
  await page.waitForTimeout(300)
  const minAfter = (await readState(page))?.prefs?.quote?.refreshMinutes
  log(minAfter === 1, 'quote-set-1min', `refreshMinutes=${minAfter}`)
  await page.screenshot({ path: 'scripts/_shot_quote_settings.png' })
  await exitEdit(page)

  // 手动「换一句」应触发换新（best-effort，受 hitokoto 限流影响则记录而非硬失败）
  const atBefore = (await readQuoteCache(page)).at ?? 0
  const textBefore = (await page.textContent('.wb-quote__text')).trim()
  await page.click('button[aria-label="换一句名言"]')
  await page.waitForTimeout(3500) // 等 hitokoto 网络往返（后端 timeout=6s）
  const qNow = (await page.textContent('.wb-quote__text')).trim()
  const atAfter = (await readQuoteCache(page)).at ?? 0
  const changed = atAfter > atBefore && qNow !== textBefore && qNow !== SEED.text
  log(changed, 'quote-manual-refresh', changed ? `换新成功: "${textBefore}" → "${qNow}"` : `未换新(可能 hitokoto 限流): before="${textBefore}" now="${qNow}" atBefore=${atBefore} atAfter=${atAfter}`)

  // ===== 测试 B：工具箱 11 工具（正常模式可点击打开弹窗）=====
  const toolCount = await page.locator('.wb-tools__grid .wb-tool-icon').count()
  const toolTitles = await page.locator('.wb-tools__grid .wb-tool-icon .wb-tool-icon__name').allTextContents()
  const expectedTools = ['计算器','金额大小写','年龄计算','番茄钟','单位换算','长度换算','重量换算','Base64','日期推算','时间戳转换','农历转换']
  const allPresent = expectedTools.every((n) => toolTitles.includes(n)) && toolCount === 11
  log(allPresent, 'tools-11-icons', `count=${toolCount} 缺失=${expectedTools.filter((n) => !toolTitles.includes(n)).join(',') || '无'}`)
  await page.screenshot({ path: 'scripts/_shot_tools_grid.png' })

  // B1：逐个打开 7 个新工具弹窗，校验标题 + 含可交互元素（正常模式）
  const newTools = [
    ['单位换算', 'unit'], ['长度换算', 'length'], ['重量换算', 'weight'],
    ['Base64', 'base64'], ['日期推算', 'dateCalc'], ['时间戳转换', 'timestamp'], ['农历转换', 'lunar'],
  ]
  for (const [name, id] of newTools) {
    await page.locator(`.wb-tools__grid .wb-tool-icon:has-text("${name}")`).first().click()
    await page.waitForSelector('.wb-pop__title', { timeout: 5000 })
    const title = (await page.textContent('.wb-pop__title')).trim()
    const hasInputOrOut = (await page.locator('.wb-pop__body input, .wb-pop__body textarea, .wb-pop__body .wb-out, .wb-pop__body .wb-calc, .wb-pop__body .wb-cv__all').count()) > 0
    log(title === name && hasInputOrOut, `tool-popup-${id}`, `title="${title}" interactive=${hasInputOrOut}`)
    await page.click('.wb-pop__mask .wb-cell__btn[aria-label="关闭"]')
    await page.waitForTimeout(150)
  }

  // B2：编辑模式打开工具箱设置页（data-id=tools 的齿轮）
  await enterEdit(page)
  await page.click('.wb-cell[data-id="tools"] button[aria-label="设置"]')
  await page.waitForSelector('.wb-pop__title', { timeout: 5000 })
  const setTitle = (await page.textContent('.wb-pop__title')).trim()
  log(setTitle === '实用工具箱 · 设置', 'tools-settings-open', `title="${setTitle}"`)

  // 标题开关：含「显示小工具标题」的 .wb-opt，点击其 .wb-switch
  const titleOpt = page.locator('.wb-opt', { hasText: '显示小工具标题' })
  const hasSwitch = (await titleOpt.locator('.wb-switch').count()) === 1
  const beforeNoname = await page.locator('.wb-tools__grid.is-noname').count()
  await titleOpt.locator('.wb-switch').click()
  await page.waitForTimeout(300)
  const afterNoname = await page.locator('.wb-tools__grid.is-noname').count()
  const showTitlePref = (await readState(page))?.prefs?.tools?.showTitle
  log(hasSwitch && beforeNoname === 0 && afterNoname === 1 && showTitlePref === false,
    'tools-showtitle-toggle', `beforeNoname=${beforeNoname} afterNoname=${afterNoname} pref=${showTitlePref}`)
  await titleOpt.locator('.wb-switch').click() // 切回 ON
  await page.waitForTimeout(300)

  // 行/列间距输入：越界钳制（列=99 应钳到 24）
  const gapSet = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.wb-row > label')]
    const find = (txt) => labels.find((l) => l.textContent.includes(txt))?.parentElement?.querySelector('input')
    const r = find('行间距'); const c = find('列间距')
    if (!r || !c) return { ok: false }
    const setVal = (el, v) => {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      proto.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setVal(r, 24); setVal(c, 99)
    return { ok: true, r: r.value, c: c.value }
  })
  await page.waitForTimeout(300)
  const gapPref = (await readState(page))?.prefs?.tools
  log(gapSet.ok && gapPref.rowGap === 24 && gapPref.colGap === 24,
    'tools-gap-clamp', `rowGap=${gapPref.rowGap} colGap=${gapPref.colGap}`)
  await page.screenshot({ path: 'scripts/_shot_tools_settings.png' })

  // 拖拽排序列表：11 行；把第 1 行拖到第 3 行，校验顺序变化
  const sortCount = await page.locator('.wb-tsort__row').count()
  const orderBefore = await page.locator('.wb-tsort__name').allTextContents()
  const orderBeforePref = (await readState(page))?.prefs?.tools?.order
  const dragResult = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wb-tsort__row')]
    if (rows.length < 3) return { ok: false }
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }))
    fire(rows[0], 'dragstart')
    fire(rows[2], 'dragover')
    fire(rows[0], 'dragend')
    return { ok: true }
  })
  await page.waitForTimeout(300)
  const orderAfter = await page.locator('.wb-tsort__name').allTextContents()
  const orderAfterPref = (await readState(page))?.prefs?.tools?.order
  const orderChanged = JSON.stringify(orderBefore) !== JSON.stringify(orderAfter) ||
    (orderBeforePref && orderAfterPref && JSON.stringify(orderBeforePref) !== JSON.stringify(orderAfterPref))
  log(sortCount === 11 && dragResult.ok && orderChanged,
    'tools-drag-sort', `rows=${sortCount} before=${JSON.stringify(orderBefore)} after=${JSON.stringify(orderAfter)}`)
  await page.screenshot({ path: 'scripts/_shot_tools_drag.png' })

  // 恢复默认顺序按钮
  await page.click('button:has-text("恢复默认顺序")')
  await page.waitForTimeout(300)
  const orderReset = (await readState(page))?.prefs?.tools?.order
  const defaultOrder = ['calc','money','age','pomodoro','unit','length','weight','base64','dateCalc','timestamp','lunar']
  log(JSON.stringify(orderReset) === JSON.stringify(defaultOrder), 'tools-reset-order', `order=${JSON.stringify(orderReset)}`)

  // 拖拽 / 恢复顺序测试后设置页弹窗仍开，先关闭再退出编辑（否则 mask 拦截编辑按钮）
  await page.click('.wb-pop__mask .wb-cell__btn[aria-label="关闭"]').catch(() => {})
  await page.waitForTimeout(200)
  await exitEdit(page)
  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无 PAGEERROR / console.error')
} catch (e) {
  log(false, 'FATAL', e.message + '\n' + (e.stack || ''))
} finally {
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\n==== 验证汇总: ${passed} 通过 / ${failed} 失败 / 共 ${results.length} ====`)
  if (errors.length) console.log('页面错误:\n' + errors.join('\n'))
  await browser.close()
}
