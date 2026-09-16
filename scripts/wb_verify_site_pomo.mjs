// 真机验证：全站统一一套品牌（站点级）+ 番茄钟状态条三态
// playwright-core（workspace node_modules）+ 系统 Edge channel='msedge'，无头。
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER1 = 'wb_probe_sys'
const USER2 = 'wb_probe_sys2'
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
const errors = []
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pg = await ctx.newPage()
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  pg.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  return { ctx, pg }
}
const toolIcon = (pg, title) => pg.locator(`.wb-tool-icon[title="${title}"]`)
const closePop = async (pg) => {
  const btn = pg.locator('.wb-pop__head button[aria-label="关闭"]')
  if (await btn.count()) { await btn.first().click(); await pg.waitForTimeout(250) }
}

// 登录并进入工作台（统一进入页面已设为 workbench）
async function loginAndEnter(pg, user) {
  const res = await pg.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: user, password: PASS, remember: true }),
  })
  const j = await res.json()
  log(j.status === 'ok', `login-${user}`, `status=${j.status}`)
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' })
  await pg.waitForSelector('.wb-grid', { timeout: 15000 })
  await pg.waitForSelector('.wb-tools__grid', { timeout: 15000 })
}

try {
  // ============ 测试 A：全站统一一套品牌 ============
  // 捕获初始站点品牌，测完还原
  const initRes = await (await browser.newContext()).request.get(`${BASE}/api/site`)
  const initSite = await initRes.json()
  log(initRes.status() === 200, 'site-get-public', `name=${initSite.site_name} title=${initSite.site_title}`)

  const { ctx: c1, pg } = await newPage()
  await loginAndEnter(pg, USER1)

  // 清掉历史番茄钟运行态，避免干扰
  await pg.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await pg.reload({ waitUntil: 'networkidle' })
  await pg.waitForSelector('.wb-tools__grid', { timeout: 15000 })

  await pg.locator('.app-nav button[aria-label="设置"]').click()
  await pg.waitForSelector('text=系统设置', { timeout: 5000 })
  log(true, 'sys-section', '设置页出现「系统设置」分区')

  const nameInput = pg.locator('.settings-body input[placeholder*="Eiger"]')
  const titleInput = pg.locator('.settings-body input[placeholder*="浏览器标签"]')
  const subInput = pg.locator('.settings-body input[placeholder*="小字标语"]')
  const logoInput = pg.locator('.settings-body input[placeholder*="图片 URL"]')
  log(
    (await nameInput.count()) === 1 && (await titleInput.count()) === 1 &&
    (await subInput.count()) === 1 && (await logoInput.count()) === 1,
    'sys-fields', '站点名称/主标题/副标题/Logo 四输入框齐全'
  )
  await nameInput.fill('我的导航站')
  await titleInput.fill('我的站点')
  await subInput.fill('欢迎回来')
  await logoInput.fill(LOGO)
  await pg.waitForTimeout(150)
  const prevCount = await pg.locator('.wb-logo-prev').count()
  log(prevCount === 1, 'sys-logo-preview', `previewImgs=${prevCount}`)

  await pg.locator('.settings-footer button.btn-primary').click()
  await pg.waitForTimeout(800)
  await pg.waitForSelector('.wb-grid', { timeout: 10000 })

  // 重新加载，验证顶栏品牌 + 文档标题
  await pg.reload({ waitUntil: 'networkidle' })
  await pg.waitForSelector('.brand-logo', { timeout: 15000 })
  const brandName = (await pg.locator('.brand-name').first().textContent().catch(() => '')) || ''
  const brandSub = (await pg.locator('.brand-sub').first().textContent().catch(() => '')) || ''
  const logoImg = await pg.locator('.brand-logo img.logo-mark--img').count()
  const docTitle = await pg.title()
  log(
    brandName.trim() === '我的导航站' && brandSub.trim() === '欢迎回来' && logoImg === 1,
    'sys-topbar-brand', `name="${brandName}" sub="${brandSub}" logoImg=${logoImg}`
  )
  log(docTitle === '我的站点', 'sys-doctitle', `document.title="${docTitle}"`)

  // 后端接口回显：GET /api/site（公开）应返回新品牌；/api/settings 不应再含 site_* 字段
  const siteRes = await pg.request.get(`${BASE}/api/site`)
  const siteJson = await siteRes.json()
  log(
    siteJson.site_name === '我的导航站' && siteJson.site_title === '我的站点' &&
    siteJson.site_subtitle === '欢迎回来' && (siteJson.site_logo || '').startsWith('data:'),
    'sys-api-site', `name=${siteJson.site_name} title=${siteJson.site_title} logo=${(siteJson.site_logo||'').slice(0,12)}…`
  )
  const setRes = await pg.request.get(`${BASE}/api/settings`)
  const setJson = await setRes.json()
  const s = setJson.settings || setJson
  log(
    s.site_name === undefined && s.site_title === undefined,
    'sys-decoupled', `user-settings 不再含 site_*（site_name=${s.site_name}）`
  )

  // 统一一套品牌：第二个用户登录，顶栏应显示第一个用户设置的同一品牌（在还原之前验证）
  const { ctx: c2, pg: pg2 } = await newPage()
  await loginAndEnter(pg2, USER2)
  await pg2.waitForSelector('.brand-logo', { timeout: 15000 })
  const name2 = (await pg2.locator('.brand-name').first().textContent().catch(() => '')) || ''
  const title2 = await pg2.title()
  log(
    name2.trim() === '我的导航站' && title2 === '我的站点',
    'sys-unified', `user2 看到 name="${name2}" title="${title2}"（与 user1 设置一致）`
  )
  const site2 = await (await pg2.request.get(`${BASE}/api/site`)).json()
  log(site2.site_name === '我的导航站', 'sys-unified-api', `user2 读到的 /api/site 一致 name=${site2.site_name}`)
  await c2.close()

  // 还原初始品牌（清理测试痕迹）
  const csrf = await (await pg.request.get(`${BASE}/api/csrf-token`)).json()
  const restoreRes = await pg.request.post(`${BASE}/api/site`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
    data: JSON.stringify({
      site_name: initSite.site_name || 'Eiger',
      site_title: initSite.site_title || '',
      site_subtitle: initSite.site_subtitle || '',
      site_logo: initSite.site_logo || '',
    }),
  })
  log(restoreRes.status() === 200, 'sys-restore', `restore HTTP ${restoreRes.status()}`)
  await c1.close()

  // ============ 测试 B：番茄钟状态条三态 ============
  const { ctx: cb, pg: pp } = await newPage()
  await loginAndEnter(pp, USER1)
  await pp.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await pp.reload({ waitUntil: 'networkidle' })
  await pp.waitForSelector('.wb-tools__grid', { timeout: 15000 })

  // B1: running —— 状态条出现在卡片头部，显示剩余时间
  await toolIcon(pp, '番茄钟').click()
  await pp.waitForSelector('.wb-pomo__quick', { timeout: 5000 })
  await pp.getByRole('button', { name: '5 分钟', exact: true }).click()
  await pp.waitForTimeout(400)
  await closePop(pp)
  await pp.waitForTimeout(200)
  const headRunning = await pp.locator('.wb-card__head .wb-tools__pomo').count()
  const badgeR = (await pp.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  const clsR = (await pp.locator('.wb-tools__pomo').first().getAttribute('class').catch(() => '')) || ''
  log(headRunning === 1 && /\d+:\d+/.test(badgeR) && clsR.includes('is-running'),
    'pomo-running', `inHead=${headRunning} badge="${badgeR}" cls="${clsR}"`)

  // B2: paused —— 暂停后状态条**仍显示**（新需求），带「点我继续」
  await toolIcon(pp, '番茄钟').click()
  await pp.waitForSelector('.wb-tool__timer', { timeout: 5000 })
  await pp.locator('.wb-tool__btns button').first().click() // 暂停
  await pp.waitForTimeout(800)
  const headPaused = await pp.locator('.wb-card__head .wb-tools__pomo').count()
  const badgeP = (await pp.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  const clsP = (await pp.locator('.wb-tools__pomo').first().getAttribute('class').catch(() => '')) || ''
  log(headPaused === 1 && badgeP.includes('点我继续') && clsP.includes('is-paused'),
    'pomo-paused-shows', `inHead=${headPaused} badge="${badgeP}" cls="${clsP}"`)
  await closePop(pp)

  // B3: clickable —— 点击状态条打开番茄钟弹窗
  await pp.locator('.wb-tools__pomo').first().click()
  await pp.waitForSelector('.wb-pomo__quick', { timeout: 5000 })
  log(true, 'pomo-clickable', '点击状态条打开番茄钟弹窗')
  await closePop(pp)

  // B4: idle —— 重置后状态条消失
  await toolIcon(pp, '番茄钟').click()
  await pp.waitForSelector('.wb-tool__timer', { timeout: 5000 })
  await pp.locator('.wb-tool__btns button', { hasText: '重置' }).click()
  await pp.waitForTimeout(600)
  const badgeIdle = await pp.locator('.wb-tools__pomo').count()
  log(badgeIdle === 0, 'pomo-idle-hides', `badge=${badgeIdle}`)
  await closePop(pp)

  // B5: finished —— 注入即将结束状态，重载后短暂显示「时间到」
  await pp.addInitScript((st) => { localStorage.setItem('wb_pomo_v1', JSON.stringify(st)) },
    { running: true, remain: 5, total: 300, startedAt: Date.now() - 10000 })
  await pp.reload({ waitUntil: 'networkidle' })
  await pp.waitForSelector('.wb-tools__grid', { timeout: 15000 })
  await pp.waitForTimeout(1800) // 等计时器触发 finish()
  const badgeF = (await pp.locator('.wb-tools__pomo').first().textContent().catch(() => '')) || ''
  const clsF = (await pp.locator('.wb-tools__pomo').first().getAttribute('class').catch(() => '')) || ''
  log(badgeF.includes('时间到') && clsF.includes('is-finished'),
    'pomo-finished-shows', `badge="${badgeF}" cls="${clsF}"`)
  await pp.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await cb.close()

  // ============ 测试 C：万年历字段齐全 ============
  const { ctx: cc, pg: pc } = await newPage()
  await loginAndEnter(pc, USER1)
  await pc.evaluate(() => localStorage.removeItem('wb_pomo_v1'))
  await pc.reload({ waitUntil: 'networkidle' })
  await pc.waitForSelector('.wb-tools__grid', { timeout: 15000 })
  await toolIcon(pc, '万年历').click()
  await pc.waitForSelector('.wb-wanli', { timeout: 5000 })
  // 基本信息 + 详细信息字段
  const checks = {
    'head-ganzhi': await pc.locator('.wb-wanli__ganzhi').count(),
    'info-bar': await pc.locator('.wb-wanli__info-bar').count(),
    'yi': await pc.locator('.wb-wanli__yj .wb-yj__yi').count(),
    'ji': await pc.locator('.wb-wanli__yj .wb-yj__ji').count(),
    'detail-title': await pc.locator('.wb-wanli__detail-title').count(),
  }
  const detailText = (await pc.locator('.wb-wanli__detail').innerText().catch(() => '')) || ''
  const needTerms = ['生肖', '星座', '彭祖百忌', '胎神占方', '五行', '季节', '星宿', '儒略日', '佛历', '伊斯兰历', '冲', '煞', '六曜', '建除', '喜神', '财神']
  const missing = needTerms.filter((t) => !detailText.includes(t))
  log(
    Object.values(checks).every((c) => c >= 1) && missing.length === 0,
    'wanli-fields', `blocks=${JSON.stringify(checks)} 缺失=${missing.join(',') || '无'}`
  )
  await cc.close()

  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无 PAGEERROR / console.error')
} catch (e) {
  log(false, 'EXCEPTION', e.message + '\n' + (e.stack || ''))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n汇总：${passed}/${results.length} 通过`)
process.exit(passed === results.length ? 0 : 1)
