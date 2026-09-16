import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
const ok = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`)

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', channel: 'msedge' }).catch(async () => {
  return chromium.launch({ headless: true })
})
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

try {
  // 登录（context 级别请求，独立于页面导航）
  const api = ctx.request
  const csrfR = await api.get(BASE + '/api/csrf-token')
  const csrf = await csrfR.json()
  const loginR = await api.post(BASE + '/api/login', {
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
    data: { username: USER, password: PASS, remember: true },
  })
  ok('登录成功', loginR.ok() && loginR.status() === 200, `status=${loginR.status()}`)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // 工作台为默认视图，待办卡片已可见；直接进入验证
  const todoCard = page.locator('.wb-card', { hasText: '待办事项' }).first()
  await todoCard.waitFor({ state: 'visible', timeout: 8000 })

  // 关键断言：count 在左侧 hgroup 内，紧跟标题；不在右侧 .wb-card__right
  const info = await todoCard.evaluate((card) => {
    const hgroup = card.querySelector('.wb-card__hgroup')
    const right = card.querySelector('.wb-card__right')
    const count = card.querySelector('.wb-todo__count')
    const title = card.querySelector('.wb-card__title')
    const inHgroup = hgroup && hgroup.contains(count)
    const inRight = right && right.contains(count)
    // 标题与计数的 DOM 顺序：count 是 title 的下一个兄弟
    let adjacent = false
    if (title && count) {
      let n = title.nextElementSibling
      while (n) { if (n === count) { adjacent = true; break } n = n.nextElementSibling }
    }
    // 几何：count 中心 x 应明显小于 right 区域中心 x（即不靠右）
    const cr = count ? count.getBoundingClientRect() : null
    const rr = right ? right.getBoundingClientRect() : null
    return {
      hasCount: !!count, countText: count ? count.textContent : null,
      inHgroup, inRight, adjacent,
      countCx: cr ? cr.x + cr.width / 2 : null,
      rightCx: rr ? rr.x + rr.width / 2 : null,
      cardW: card.getBoundingClientRect().width,
    }
  })

  ok('计数元素存在', info.hasCount, `text="${info.countText}"`)
  ok('计数在左侧 hgroup 内(不靠右)', info.inHgroup && !info.inRight)
  ok('计数紧跟标题之后', info.adjacent)
  ok('计数为纯数字', info.countText != null && /^\d+$/.test(info.countText.trim()), `text="${info.countText}"`)
  if (info.countCx != null && info.rightCx != null && info.cardW) {
    // 计数应明显位于右侧操作区(靠右对齐的下拉/按钮)的左侧 → 未靠右
    ok('计数未靠右(明显在右侧操作区左侧)', info.countCx < info.rightCx - info.cardW * 0.2,
      `countCx=${(info.countCx/info.cardW*100).toFixed(0)}% rightCx=${(info.rightCx/info.cardW*100).toFixed(0)}%`)
  }
} catch (e) {
  results.push('FAIL | 脚本异常 | ' + e.message)
} finally {
  await browser.close()
}

console.log('\n==== Todo 计数位置验证 ====')
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)

// 截图留存视觉证据
try {
  const todoCard = page.locator('.wb-card', { hasText: '待办事项' }).first()
  await todoCard.screenshot({ path: 'D:/wwwroot/workbuddy/python-nav/scripts/_todo_count.png' })
  console.log('截图: scripts/_todo_count.png')
} catch (e) { /* 截图失败不影响结果 */ }

process.exit(failed.length ? 1 : 0)
