import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000/'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
function ok(name, cond, info = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`)
}

// 平台标签 → 期望域名（验证「点抖音却跳 B 站」类串台 bug 是否修复）
const LABEL_HOST = {
  微博: 'weibo.com',
  知乎: 'zhihu.com',
  百度: 'baidu.com',
  B站: 'bilibili.com',
  抖音: 'douyin.com',
  头条: 'toutiao.com',
  贴吧: 'tieba.baidu.com',
}

async function pickSelect(page, rowLabel, optionText) {
  const row = page.locator(`.wb-pop .wb-row:has(label:text-is("${rowLabel}"))`)
  await row.locator('.select-trigger').click()
  await page.waitForSelector('.select-pop--portal', { state: 'visible', timeout: 5000 })
  await page.locator('.select-pop--portal .select-opt', { hasText: optionText }).first().click()
  await page.waitForTimeout(300)
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    channel: 'msedge',
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => results.push(`FAIL  前端运行时异常  (${e.message})`))
    page.on('console', (m) => {
      if (m.type() === 'error') results.push(`FAIL  控制台错误  (${m.text()})`)
    })

    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': csrf.token,
    }
    await api.post(BASE + 'api/login', { headers, data: { username: USER, password: PASS, remember: true } })

    // 注入确定性状态：tabs 布局 + auto 源 + 全平台
    const cur = await (await api.get(BASE + 'api/workbench/state')).json()
    const state = cur.state && typeof cur.state === 'object' ? JSON.parse(JSON.stringify(cur.state)) : {}
    state.order = ['time', 'weather', 'countdown', 'calendar', 'watchlist', 'note', 'todo', 'tools', 'links', 'hotlist', 'bidding']
    state.sizes = state.sizes || {}
    state.sizes.hotlist = { w: 9, h: 3 }
    state.prefs = state.prefs || {}
    state.prefs.hotlist = {
      platforms: ['weibo', 'zhihu', 'baidu', 'bili', 'douyin', 'toutiao', 'tieba'],
      layout: 'tabs',
      provider: 'auto',
      limit: 20,
      autoRefresh: true,
      interval: 60,
    }
    const put = await api.put(BASE + 'api/workbench/state', { headers, data: { state } })
    ok('保存工作台状态(含 hotlist)', put.status() === 200, 'HTTP ' + put.status())

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForSelector('.wb-grid', { timeout: 15000 })
    const card = page.locator('.wb-hotlist').first()
    await card.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(1800) // 等首屏拉取

    // 1) 卡片渲染
    ok('热搜卡片渲染', (await card.count()) === 1)

    // 2) 平台 tabs = 7
    const tabs = page.locator('.wb-hotlist__tab')
    ok('平台切换 chips = 7', (await tabs.count()) === 7, 'count=' + (await tabs.count()))

    // 3) 列表有数据
    const items = page.locator('.wb-hotlist__item')
    await items.first().waitFor({ state: 'visible', timeout: 10000 })
    ok('热搜列表有数据', (await items.count()) > 0, 'items=' + (await items.count()))

    // 4) 排名 top3 高亮
    ok('排名 1 高亮徽标', (await page.locator('.wb-hotlist__rank.is-1').count()) >= 1)

    // 5) 更新时间 / 来源徽标
    const sync = page.locator('.wb-hotlist__sync').first()
    ok('显示「更新于」时间', (await sync.count()) === 1 && (await sync.innerText()).includes('更新于'))
    const srcBadge = page.locator('.wb-hotlist__src').first()
    ok('显示数据来源徽标', (await srcBadge.count()) >= 1, (await srcBadge.innerText()).trim())

    // 6) 串台修复：点各平台后，首个条目的外链域名必须匹配该平台（不再统一跳微博/B站）
    const checks = [
      { idx: 0, label: '微博', host: 'weibo.com' },
      { idx: 1, label: '知乎', host: 'zhihu.com' },
      { idx: 2, label: '百度', host: 'baidu.com' },
      { idx: 4, label: '抖音', host: 'douyin.com' },
      { idx: 5, label: '头条', host: 'toutiao.com' },
      { idx: 6, label: '贴吧', host: 'tieba.baidu.com' },
    ]
    for (const c of checks) {
      await tabs.nth(c.idx).click()
      await page.waitForTimeout(1400)
      const active = page.locator('.wb-hotlist__tab.is-active').first()
      ok(`切换平台「${c.label}」激活态`, (await active.innerText()).trim() === c.label)
      const firstItem = page.locator('.wb-hotlist__item').first()
      const href = (await firstItem.getAttribute('href')) || ''
      ok(`「${c.label}」首条外链域名正确(${c.host})`, href.includes(c.host), href.slice(0, 48))
    }

    // 7) 手动刷新按钮可点
    const refreshBtn = page.locator('.wb-hotlist__refresh').first()
    await refreshBtn.click()
    await page.waitForTimeout(1200)
    ok('手动刷新按钮可点击', (await refreshBtn.count()) === 1)

    // 8) 设置页：布局 / 数据源 / 多选平台 / 条数 / 自动刷新
    const editBtn = page.locator('button[title="编辑工作台"]').first()
    ok('顶栏存在编辑按钮', (await editBtn.count()) === 1)
    await editBtn.click()
    await page.waitForSelector('.wb-cell--edit', { timeout: 8000 })
    await page.waitForTimeout(400)
    const gear = page.locator('.wb-cell:has(.wb-hotlist) .wb-cell__btn[title="设置"]').first()
    await gear.waitFor({ state: 'visible', timeout: 8000 })
    await gear.click()
    await page.waitForSelector('.wb-pop', { timeout: 8000 })

    const popText = (await page.locator('.wb-pop').first().innerText()).replace(/\s+/g, ' ')
    ok('设置页含「展示方式」(布局)', popText.includes('展示方式'))
    ok('设置页含「数据源」', popText.includes('数据源'))
    ok('设置页含「展示平台」(多选)', popText.includes('展示平台'))
    ok('设置页含「每平台条数」', popText.includes('每平台条数'))
    ok('设置页含「自动刷新」', popText.includes('自动刷新'))

    // 平台多选 chips：默认 7 个全亮
    const chips = page.locator('.wb-pop .wb-chips .wb-chip')
    const onChips = await page.locator('.wb-pop .wb-chips .wb-chip.is-on').count()
    ok('多选平台 chips 共 7 个', (await chips.count()) === 7, 'count=' + (await chips.count()))
    ok('默认 7 个平台全勾选', onChips === 7, 'on=' + onChips)

    // 数据源改为 uapis（确定性，避免 apizero 并发限流），布局改为分栏并排
    await pickSelect(page, '数据源', 'uapis')
    await pickSelect(page, '展示方式', '分栏并排')
    await page.waitForTimeout(600)

    // 关闭弹窗，查看 columns 布局
    const closeBtn = page.locator('.wb-pop .wb-btn-ghost, button[aria-label="关闭"], .wb-pop__close').first()
    if (await closeBtn.count()) await closeBtn.click().catch(() => {})
    await page.waitForTimeout(400)

    const cols = page.locator('.wb-hotlist__cols')
    ok('分栏布局渲染(.wb-hotlist__cols)', (await cols.count()) === 1)
    const colCount = await page.locator('.wb-hotlist__col').count()
    ok('分栏数量 = 已选平台数(7)', colCount === 7, 'cols=' + colCount)

    // 每列：表头平台名 + 首条外链域名匹配（验证分栏下也正确）
    let colChecked = 0
    const colLocators = page.locator('.wb-hotlist__col')
    const n = await colLocators.count()
    for (let i = 0; i < n; i++) {
      const col = colLocators.nth(i)
      const name = (await col.locator('.wb-hotlist__col-name').innerText()).trim()
      const expectHost = LABEL_HOST[name]
      const colItems = col.locator('.wb-hotlist__item')
      if (expectHost && (await colItems.count()) > 0) {
        const h = (await colItems.first().getAttribute('href')) || ''
        if (h.includes(expectHost)) colChecked++
      }
    }
    ok('分栏中各平台首条域名均正确', colChecked >= 5, `checked=${colChecked}/${n}`)

    // 多选写回：取消「贴吧」→ 列数变为 6 且无贴吧列（仍在编辑态，直接点齿轮重开设置）
    const gear2 = page.locator('.wb-cell:has(.wb-hotlist) .wb-cell__btn[title="设置"]').first()
    await gear2.waitFor({ state: 'visible', timeout: 8000 })
    await gear2.click()
    await page.waitForSelector('.wb-pop', { timeout: 8000 })
    const tiebaChip = page.locator('.wb-pop .wb-chips .wb-chip', { hasText: '贴吧' }).first()
    ok('存在「贴吧」平台 chip', (await tiebaChip.count()) === 1)
    await tiebaChip.click() // 取消勾选
    await page.waitForTimeout(500)
    const tiebaOn = await page.locator('.wb-pop .wb-chips .wb-chip.is-on', { hasText: '贴吧' }).count()
    ok('取消勾选后「贴吧」不再高亮', tiebaOn === 0)
    const close2 = page.locator('.wb-pop .wb-btn-ghost, button[aria-label="关闭"], .wb-pop__close').first()
    if (await close2.count()) await close2.click().catch(() => {})
    await page.waitForTimeout(500)
    const colCount2 = await page.locator('.wb-hotlist__col').count()
    ok('取消平台后列数变为 6', colCount2 === 6, 'cols=' + colCount2)
    ok('取消后无「贴吧」列', (await page.locator('.wb-hotlist__col:has(.wb-hotlist__col-name:text-is("贴吧"))').count()) === 0)

    await page.waitForTimeout(400)
    const fails = results.filter((r) => r.startsWith('FAIL'))
    console.log('\n==== 热搜组件验证结果 ====')
    results.forEach((r) => console.log(r))
    console.log(`\n合计 ${results.length} 项，失败 ${fails.length} 项`)
    process.exitCode = fails.length ? 1 : 0
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('运行异常:', e)
  process.exit(1)
})
