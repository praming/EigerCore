// 真机验证：系统设置（站点品牌）+ 番茄钟状态条与标题同行右对齐
// playwright-core（workspace node_modules）+ 系统 Edge channel='msedge'，无头。
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
const log = (ok, step, detail) => {
  results.push({ ok, step, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 离线可加载的 data URI logo（用于验证自定义 logo 渲染）
const LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='7' fill='%234f46e5'/%3E%3C/svg%3E"

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

  // 清掉可能的历史番茄钟运行态
  await page.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-tools__grid', { timeout: 15000 })

  // ===== 测试 A：系统设置（站点品牌）=====
  await page.locator('.app-nav button[aria-label="设置"]').click()
  await page.waitForSelector('text=系统设置', { timeout: 5000 })
  log(true, 'sys-settings-section', '设置页出现「系统设置」分区')

  // 填四个字段
  const nameInput = page.locator('.settings-body input[placeholder*="Eiger"]')
  const titleInput = page.locator('.settings-body input[placeholder*="浏览器标签"]')
  const subInput = page.locator('.settings-body input[placeholder*="小字标语"]')
  const logoInput = page.locator('.settings-body input[placeholder*="图片 URL"]')
  log(
    (await nameInput.count()) === 1 && (await titleInput.count()) === 1 &&
    (await subInput.count()) === 1 && (await logoInput.count()) === 1,
    'sys-settings-fields', '站点名称/主标题/副标题/Logo 四输入框齐全'
  )
  await nameInput.fill('我的导航站')
  await titleInput.fill('我的站点')
  await subInput.fill('欢迎回来')
  await logoInput.fill(LOGO)
  await page.waitForTimeout(150)

  // logo 预览应渲染
  const prevCount = await page.locator('.wb-logo-prev').count()
  log(prevCount === 1, 'sys-logo-preview', `previewImgs=${prevCount}`)

  // 保存
  await page.locator('.settings-footer button.btn-primary').click()
  await page.waitForTimeout(800)
  await page.waitForSelector('.wb-grid', { timeout: 10000 })

  // 重新加载，验证后端持久化 + 顶栏品牌替换 + 文档标题
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.brand-logo', { timeout: 15000 })
  const brandName = (await page.locator('.brand-name').first().textContent().catch(() => '')) || ''
  const brandSub = (await page.locator('.brand-sub').first().textContent().catch(() => '')) || ''
  const logoImg = await page.locator('.brand-logo img.logo-mark--img').count()
  const docTitle = await page.title()
  log(
    brandName.trim() === '我的导航站' && brandSub.trim() === '欢迎回来' && logoImg === 1,
    'sys-topbar-brand', `name="${brandName}" sub="${brandSub}" logoImg=${logoImg}`
  )
  log(docTitle === '我的站点', 'sys-doctitle', `document.title="${docTitle}"`)

  // 后端接口回显：GET /api/settings 应包含 site_* 字段
  const setRes = await page.request.get(`${BASE}/api/settings`)
  const setJson = await setRes.json()
  const s = setJson.settings || setJson
  log(
    s.site_name === '我的导航站' && s.site_title === '我的站点' &&
    s.site_subtitle === '欢迎回来' && s.site_logo && s.site_logo.startsWith('data:'),
    'sys-api-persist', `site_name=${s.site_name} title=${s.site_title} logo=${(s.site_logo || '').slice(0, 12)}…`
  )

  // ===== 测试 B：番茄钟状态条与【实用工具箱】同一行（头部右侧）=====
  await toolIcon('番茄钟').click()
  await page.waitForSelector('.wb-pomo__quick', { timeout: 5000 })
  await page.getByRole('button', { name: '5 分钟', exact: true }).click()
  await page.waitForTimeout(400)
  await closePop()
  await page.waitForTimeout(200)

  // 关键断言：状态条位于卡片头部（.wb-card__head）内 → 与标题同一行
  const inHead = await page.locator('.wb-card__head .wb-tools__pomo').count()
  const badgeTxt = (await page.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  log(inHead === 1 && /\d+:\d+/.test(badgeTxt), 'pomo-same-line', `inHeader=${inHead} badge="${badgeTxt}"`)

  // 暂停后状态条消失
  await toolIcon('番茄钟').click()
  await page.waitForSelector('.wb-tool__timer', { timeout: 5000 })
  await page.locator('.wb-tool__btns button').first().click()
  await page.waitForTimeout(800)
  const badgeAfterPause = await page.locator('.wb-tools__pomo').count()
  log(badgeAfterPause === 0, 'pomo-pause-hides', `badge=${badgeAfterPause}`)
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
