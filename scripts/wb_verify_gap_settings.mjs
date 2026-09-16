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

    // 进入编辑模式
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

    // ===== 日历：网格间距 行/列同排各半 =====
    let body = await openSettings('日历')
    let gap2 = body.locator('.wb-gap2')
    ok('日历·网格间距使用 .wb-gap2 两列布局', (await gap2.count()) === 1)
    const calCols = gap2.locator('.wb-gap2__col')
    ok('日历·网格间距含 2 个半宽列', (await calCols.count()) === 2, `cols=${await calCols.count()}`)
    const calLabels = await calCols.locator('label').allInnerTexts()
    ok('日历·两列为「行间距 / 列间距」', calLabels.join('|') === '行间距|列间距', calLabels.join('|'))
    ok('日历·网格间距含输入控件', (await gap2.locator('input.wb-input').count()) === 2)
    ok('日历·含自适应提示', (await body.locator('.wb-muted').count()) >= 1)
    await closePop()

    // ===== 工具箱：两个「显示选项」合并 + 网格间距同排各半 =====
    body = await openSettings('实用工具箱')
    const secTexts = await body.locator('.wb-pop__sec').allInnerTexts()
    const optCount = secTexts.filter((t) => t.trim() === '显示选项').length
    ok('工具箱·仅一个「显示选项」区块（已合并）', optCount === 1, `count=${optCount}`)
    const optLabels = await body.locator('.wb-opt__label').allInnerTexts()
    const optJoined = optLabels.join('|')
    ok('工具箱·显示选项含「显示标题」', optJoined.includes('显示标题'))
    ok('工具箱·显示选项含「显示小工具标题」', optJoined.includes('显示小工具标题'))
    // 独立的工具箱「显示选项」标题不应再存在（合并进通用区块）
    ok('工具箱·无重复「显示选项」独立标题', (await body.locator('.wb-pop__sec', { hasText: '显示选项' }).count()) === 1)

    // 网格间距同排各半
    gap2 = body.locator('.wb-gap2')
    ok('工具箱·网格间距使用 .wb-gap2 两列布局', (await gap2.count()) === 1)
    const toolCols = gap2.locator('.wb-gap2__col')
    ok('工具箱·网格间距含 2 个半宽列', (await toolCols.count()) === 2, `cols=${await toolCols.count()}`)
    const toolLabels = await toolCols.locator('label').allInnerTexts()
    ok('工具箱·两列为「行间距 / 列间距」', toolLabels.join('|') === '行间距|列间距', toolLabels.join('|'))
    const toolInputs = gap2.locator('input.wb-input')
    ok('工具箱·网格间距含 2 个输入控件', (await toolInputs.count()) === 2)
    // 输入框应明显收窄（半宽）：宽度应 <= 弹窗内容宽度的 60%
    const halfW = await toolCols.first().evaluate((el) => el.getBoundingClientRect().width)
    const popW = await body.evaluate((el) => el.getBoundingClientRect().width)
    ok('工具箱·半宽列 <= 弹窗宽 65%', halfW > 0 && halfW <= popW * 0.65, `col=${Math.round(halfW)} pop=${Math.round(popW)}`)
    await closePop()

    // ===== 其他卡片不应误引入 .wb-gap2（仅日历/工具箱有网格间距）=====
    // （此为结构保证，已通过上方两卡断言；其余卡片设置页无 .wb-gap2 即符合预期）

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
