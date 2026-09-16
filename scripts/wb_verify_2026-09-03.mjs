// 真机验证：年龄快速填写 + 番茄钟跨弹窗持续 + 万年历
// playwright-core（workspace node_modules）+ 系统 Edge channel='msedge'，无头。
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
const toSec = (s) => { const m = /^(\d+):(\d+)$/.exec((s || '').trim()); return m ? +m[1] * 60 + +m[2] : NaN }

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })

const toolIcon = (title) => page.locator(`.wb-tool-icon[title="${title}"]`)
const closePop = async () => {
  const btn = page.locator('.wb-pop__head button[aria-label="关闭"]')
  if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(250) }
}

try {
  // 1) 登录
  const loginRes = await page.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: USER, password: PASS, remember: true }),
  })
  const loginJson = await loginRes.json()
  log(loginJson.status === 'ok', 'login', `status=${loginJson.status}`)

  // 2) 进入工作台
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-grid', { timeout: 15000 })
  await page.waitForSelector('.wb-tools__grid', { timeout: 15000 })
  log(true, 'load-workbench', '工作台渲染完成')

  // 清掉可能的历史番茄钟运行态，保证从干净态开始
  await page.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-tools__grid', { timeout: 15000 })

  // ===== 测试 1：工具箱共 12 个小工具（含万年历）=====
  const toolCount = await page.locator('.wb-tools__grid .wb-tool-icon').count()
  const wanliIcon = await page.locator('.wb-tools__grid .wb-tool-icon[title="万年历"]').count()
  log(toolCount === 12 && wanliIcon === 1, 'tools-count-12', `count=${toolCount} hasWanli=${wanliIcon === 1}`)

  // ===== 测试 2：年龄快速填写 =====
  await toolIcon('年龄计算').click()
  await page.waitForSelector('.wb-pop__body input.wb-input', { timeout: 5000 })
  await page.fill('.wb-pop__body input.wb-input', '1990-05-20')
  await page.locator('.wb-pop__body input.wb-input').press('Enter')
  await page.waitForTimeout(300)
  const ageOut = (await page.locator('.wb-pop__body .wb-out').first().textContent().catch(() => '')) || ''
  log(/岁/.test(ageOut) && /生肖/.test(ageOut), 'age-quick-fill', `out="${ageOut.replace(/\s+/g, ' ').slice(0, 40)}"`)
  // 日历选择也仍可用：打开日历弹层并点「今天」
  await page.locator('.wb-pop__body .wb-date__trigger').click()
  await page.waitForTimeout(200)
  const datePop = await page.locator('.wb-date__pop').count()
  log(datePop === 1, 'age-datepicker', `datePopOpen=${datePop === 1}`)
  await closePop()

  // ===== 测试 3：番茄钟跨弹窗持续计时 =====
  await toolIcon('番茄钟').click()
  await page.waitForSelector('.wb-pomo__quick', { timeout: 5000 })
  // 点「5 分钟」开始
  await page.getByRole('button', { name: '5 分钟', exact: true }).click()
  await page.waitForTimeout(400)
  const pomoRunning1 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wb_pomo_v1') || '{}')
    return !!s.running && typeof s.startedAt === 'number'
  })
  log(pomoRunning1, 'pomo-started', `wb_pomo_v1.running=${pomoRunning1}`)

  // 关闭弹窗（不应暂停）
  await closePop()
  await page.waitForTimeout(200)
  const badge1 = (await page.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  const badgeVisible = await page.locator('.wb-tools__pomo').count()
  log(badgeVisible === 1 && toSec(badge1) > 0, 'pomo-badge-after-close', `badge="${badge1}" running=${badgeVisible === 1}`)

  // 等待 2.5s，徽标计时应继续递减（不暂停）
  await sleep(2500)
  const badge2 = (await page.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  log(toSec(badge2) < toSec(badge1), 'pomo-keeps-ticking', `badge1=${badge1} -> badge2=${badge2}`)

  // 重新打开弹窗，弹窗内计时与徽标一致（仍在进行）
  await toolIcon('番茄钟').click()
  await page.waitForSelector('.wb-tool__timer', { timeout: 5000 })
  const popTimer = (await page.locator('.wb-tool__timer').textContent()).trim()
  log(Math.abs(toSec(popTimer) - toSec(badge2)) <= 3, 'pomo-pop-matches-badge', `pop="${popTimer}" badge2=${badge2}`)

  // 暂停：徽标应消失
  await page.locator('.wb-tool__btns button').first().click() // 显示「暂停」-> 暂停
  await page.waitForTimeout(1000)
  const badgeAfterPause = await page.locator('.wb-tools__pomo').count()
  const runningAfterPause = await page.evaluate(() => JSON.parse(localStorage.getItem('wb_pomo_v1') || '{}').running)
  log(runningAfterPause === false && badgeAfterPause === 0, 'pomo-pause-hides-badge', `running=${runningAfterPause} badge=${badgeAfterPause}`)
  await closePop()

  // ===== 测试 4：万年历 =====
  await toolIcon('万年历').click()
  await page.waitForSelector('.wb-wanli__grid', { timeout: 5000 })
  const cellCount = await page.locator('.wb-wanli__cell:not(.is-empty)').count()
  const lunarCount = await page.locator('.wb-wanli__lunar').filter({ hasText: /\S/ }).count()
  const todayCount = await page.locator('.wb-wanli__cell.is-today').count()
  log(cellCount >= 28 && lunarCount >= 28 && todayCount === 1, 'wanli-grid', `cells=${cellCount} lunar=${lunarCount} today=${todayCount}`)
  // 导航：下一个月
  const titleBefore = (await page.locator('.wb-wanli__title').textContent()).trim()
  await page.locator('.wb-wanli__nav .wb-date__nav-btn').nth(1).click()
  await page.waitForTimeout(200)
  const titleAfter = (await page.locator('.wb-wanli__title').textContent()).trim()
  log(titleBefore !== titleAfter, 'wanli-nav', `before="${titleBefore}" after="${titleAfter}"`)
  // 选一个非空日期 -> 详情
  await page.locator('.wb-wanli__cell:not(.is-empty)').first().click()
  await page.waitForTimeout(200)
  const detailTxt = (await page.locator('.wb-wanli__detail').textContent().catch(() => '')) || ''
  log(/农历/.test(detailTxt) && /生肖/.test(detailTxt), 'wanli-detail', `detail="${detailTxt.replace(/\s+/g, ' ').slice(0, 40)}"`)
  await closePop()

  // ===== 无控制台错误 =====
  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无 PAGEERROR / console.error')
} catch (e) {
  log(false, 'EXCEPTION', e.message + '\n' + (e.stack || ''))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n汇总：${passed}/${results.length} 通过`)
process.exit(passed === results.length ? 0 : 1)
