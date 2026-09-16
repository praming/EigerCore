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

    // ===== 1. 待办事项：已完成图标换成 laptop-minimal-check =====
    const todoCard = page.locator('.wb-cell', { hasText: '待办事项' }).first()
    await todoCard.waitFor({ state: 'visible', timeout: 8000 })
    const doneBtn = todoCard.locator('.wb-cell__btn[aria-label="已完成"]')
    ok('待办卡含「已完成」按钮', (await doneBtn.count()) === 1)
    const doneIcon = doneBtn.locator('svg.lucide-laptop-minimal-check')
    ok('已完成图标为 laptop-minimal-check', (await doneIcon.count()) === 1)
    // 反向确认：旧的 square-check-big 不应再出现
    ok('旧图标 square-check-big 已移除', (await todoCard.locator('svg.lucide-square-check-big').count()) === 0)

    // ===== 2. 日历·设置：两个「显示选项」合并为一个 =====
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)
    const calCard = page.locator('.wb-cell', { hasText: '日历' }).first()
    await calCard.locator('.wb-cell__btn[aria-label="设置"]').click()
    await page.waitForTimeout(500)
    const body = page.locator('.wb-pop__body')
    const secTexts = await body.locator('.wb-pop__sec').allInnerTexts()
    const optCount = secTexts.filter((t) => t.trim() === '显示选项').length
    ok('日历设置仅一个「显示选项」区块', optCount === 1, `count=${optCount}`)
    const optLabels = await body.locator('.wb-opt__label').allInnerTexts()
    const optJoined = optLabels.join('|')
    ok('含「显示标题」', optJoined.includes('显示标题'))
    ok('含「显示农历」', optJoined.includes('显示农历'))
    ok('含「自适应撑满」', optJoined.includes('自适应撑满'))
    ok('仍含「网格间距」区块', secTexts.some((t) => t.includes('网格间距')))
    // 关闭设置弹窗
    await page.locator('.wb-pop__foot').locator('button', { name: '完成' }).click().catch(() => {})
    await page.waitForTimeout(300)

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
