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

const run = async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    channel: 'msedge',
  })
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

    // 把天气城市固定为「郑州」，使太阳弹窗查询确定
    await api.put(BASE + 'api/workbench/state', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { state: { prefs: { weather: { city: '郑州' } } } },
    })

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    // ===== A. 太阳按钮替换「详情」=====
    const wxCard = page.locator('.wb-weather-card').first()
    await wxCard.waitFor({ state: 'visible', timeout: 8000 })
    const sunBtn = wxCard.locator('.wb-weather-card__sun')
    ok('天气卡含太阳按钮(.wb-weather-card__sun)', (await sunBtn.count()) === 1)
    const metaText = await wxCard.locator('.wb-card__meta, .wb-muted').first().allInnerTexts().catch(() => [''])
    ok('太阳按钮区域不含旧「详情」文案', !metaText.join('').includes('详情'))

    // ===== B. 点击太阳按钮打开弹窗 =====
    await sunBtn.click()
    await page.waitForTimeout(600)
    const modal = page.locator('.wb-sun-modal')
    ok('太阳弹窗(.wb-sun-modal)打开', (await modal.count()) === 1 && (await modal.isVisible()))
    const titleText = await modal.locator('.wb-sun__title').innerText()
    ok('弹窗标题含「日出日落」', titleText.includes('日出日落'), titleText.replace(/\s+/g, ' '))

    // ===== C. 三视图分段 + 默认周视图 =====
    const views = modal.locator('.wb-sun__view')
    ok('年/月/周三视图分段存在', (await views.count()) === 3)
    const weekOn = await views.nth(2).getAttribute('class')
    ok('默认视图为「周」(week.on)', (weekOn || '').includes('on'), weekOn || '')
    // 周视图应有 3 个下拉：年 + 月 + 周
    ok('周视图含 3 个下拉(年/月/周)', (await modal.locator('.wb-sun__sel').count()) === 3)

    // ===== D. 周视图真实数据渲染 =====
    // 默认当前周受测试环境时钟(2026)影响，可能落在档案未来区间(无数据)。
    // 改选历史年份的一周，验证周视图渲染链路（真实用户实时打开时当前周必有数据）。
    await modal.locator('.wb-sun__sel').nth(0).selectOption({ value: '2024' }, { timeout: 5000 }) // 年 → 2024
    await page.waitForFunction(
      () => {
        const s = document.querySelectorAll('.wb-sun-modal .wb-sun__sel')
        return s.length >= 3 && s[2] && s[2].querySelector('option[value="10"]')
      },
      { timeout: 5000 },
    ).catch(() => {})
    await modal.locator('.wb-sun__sel').nth(2).selectOption({ value: '10' }, { timeout: 5000 }) // 周 → 2024 第10周
    // 等真实数据行出现，而非固定延时（规避重渲染竞态）
    await page.waitForFunction(
      () => document.querySelectorAll('.wb-sun-modal .wb-sun__row:not(.wb-sun__row--head)').length >= 1,
      { timeout: 8000 },
    ).catch(() => {})
    ok('周视图无错误态', (await modal.locator('.wb-sun__err').count()) === 0)
    const weekRows = modal.locator('.wb-sun__row:not(.wb-sun__row--head)')
    const weekN = await weekRows.count()
    ok('周视图逐日列表有数据行', weekN >= 1, `rows=${weekN}`)
    // 当前周含今天，部分日期为未来 → 至少应出现一条 HH:MM 日出（本周已过的日子）
    let foundHHMM = false
    for (let i = 0; i < weekN; i++) {
      const t = await weekRows.nth(i).innerText()
      if (/\d{1,2}:\d{2}/.test(t)) { foundHHMM = true; break }
    }
    ok('周视图出现 HH:MM 格式日出/日落', foundHHMM)

    // ===== E. 年视图 =====
    await views.nth(0).click() // 年
    await page.waitForTimeout(300)
    const yearOn = await views.nth(0).getAttribute('class')
    ok('切换到「年」视图(year.on)', (yearOn || '').includes('on'), yearOn || '')
    ok('年视图仅 1 个下拉(年)', (await modal.locator('.wb-sun__sel').count()) === 1)
    // 选一个完整历史年份，确保整年数据齐全
    await modal.locator('.wb-sun__sel').first().selectOption({ value: '2024' })
    await page.waitForFunction(
      () => document.querySelectorAll('.wb-sun-modal .wb-sun__mo').length >= 12,
      { timeout: 8000 },
    ).catch(() => {})
    const moCards = modal.locator('.wb-sun__mo')
    const moN = await moCards.count()
    ok('年视图渲染 12 个月卡片', moN === 12, `months=${moN}`)
    // 年视图按月聚合：至少应有昼长文字与一条有效日出
    let yearHL = false
    for (let i = 0; i < moN; i++) {
      const sub = await moCards.nth(i).locator('.wb-sun__mo-sub').innerText()
      const dl = await moCards.nth(i).locator('.wb-sun__mo-dl').innerText()
      if (/\d{1,2}:\d{2}/.test(sub) && /\d/.test(dl)) { yearHL = true; break }
    }
    ok('年视图按月聚合含昼长+日出', yearHL)

    // ===== F. 年 → 月 下钻 =====
    await moCards.first().click() // 点 1 月下钻
    await page.waitForTimeout(300)
    const monthOn = await views.nth(1).getAttribute('class')
    ok('点击月份下钻到「月」视图(month.on)', (monthOn || '').includes('on'), monthOn || '')
    ok('月视图含 2 个下拉(年/月)', (await modal.locator('.wb-sun__sel').count()) === 2)
    await page.waitForFunction(
      () => document.querySelectorAll('.wb-sun-modal .wb-sun__row:not(.wb-sun__row--head)').length >= 1,
      { timeout: 8000 },
    ).catch(() => {})
    const moRows = modal.locator('.wb-sun__row:not(.wb-sun__row--head)')
    ok('月视图逐日列表有数据行', (await moRows.count()) >= 1, `rows=${await moRows.count()}`)
    let moHL = false
    const mn = await moRows.count()
    for (let i = 0; i < mn; i++) {
      if (/\d{1,2}:\d{2}/.test(await moRows.nth(i).innerText())) { moHL = true; break }
    }
    ok('月视图出现 HH:MM 日出/日落', moHL)

    // ===== G. 回到周视图（3 下拉）=====
    await views.nth(2).click() // 周
    await page.waitForTimeout(400)
    const weekOn2 = await views.nth(2).getAttribute('class')
    ok('切回「周」视图(week.on)', (weekOn2 || '').includes('on'), weekOn2 || '')
    ok('周视图恢复 3 个下拉', (await modal.locator('.wb-sun__sel').count()) === 3)

    // ===== H. 关闭弹窗 =====
    await modal.locator('.wb-sun__close').click()
    await page.waitForTimeout(400)
    ok('关闭按钮隐藏太阳弹窗', (await modal.count()) === 0 || !(await modal.isVisible()))

    // ===== I. 空/错误态：缺参返 400（后端契约）=====
    const bad = await api.get(BASE + 'api/sun-history?city=%E9%83%91%E5%B7%9E')
    ok('后端缺 start/end 返 400', bad.status() === 400, `status=${bad.status()}`)

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
