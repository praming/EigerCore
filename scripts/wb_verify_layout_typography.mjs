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

    // ===== 待办·排版：行间距/字号 同排各半 =====
    let body = await openSettings('待办事项')
    const todoSecs = await body.locator('.wb-pop__sec').allInnerTexts()
    const typoIdx = todoSecs.findIndex((t) => t.trim() === '排版')
    ok('待办·含「排版」区块', typoIdx >= 0, `idx=${typoIdx}`)
    // 排版区块后的 .wb-gap2（仅一个，含 行间距/字号 两列）
    const todoGap = body.locator('.wb-gap2')
    ok('待办·排版使用 .wb-gap2 两列布局', (await todoGap.count()) >= 1)
    const todoCols = todoGap.first().locator('.wb-gap2__col')
    ok('待办·排版含 2 个半宽列', (await todoCols.count()) === 2, `cols=${await todoCols.count()}`)
    const todoLabels = await todoCols.locator('label').allInnerTexts()
    ok('待办·排版两列为「行间距 / 字号」', todoLabels.join('|') === '行间距|字号', todoLabels.join('|'))
    const t1 = await todoCols.nth(0).boundingBox()
    const t2 = await todoCols.nth(1).boundingBox()
    const todoSameLine = !!t1 && !!t2 && Math.abs((t1.y + t1.height / 2) - (t2.y + t2.height / 2)) < 5
    ok('待办·排版两列在同一行', todoSameLine, todoSameLine ? '' : 'not aligned')
    await closePop()

    // ===== 记事·排版：行间距/字号 + 内容内边距/页面内边距 各同排两列 =====
    body = await openSettings('记事本')
    const noteSecs = await body.locator('.wb-pop__sec').allInnerTexts()
    const nIdx = noteSecs.findIndex((t) => t.trim() === '排版')
    ok('记事·含「排版」区块', nIdx >= 0, `idx=${nIdx}`)
    const noteGap = body.locator('.wb-gap2')
    ok('记事·排版使用 2 个 .wb-gap2（两行各两列）', (await noteGap.count()) === 2, `blocks=${await noteGap.count()}`)
    const noteLabelsAll = []
    for (let i = 0; i < (await noteGap.count()); i++) {
      const cols = noteGap.nth(i).locator('.wb-gap2__col')
      ok(`记事·排版第${i + 1}块含 2 个半宽列`, (await cols.count()) === 2, `cols=${await cols.count()}`)
      const ls = await cols.locator('label').allInnerTexts()
      noteLabelsAll.push(...ls)
    }
    ok('记事·排版标签为 行间距/字号/内容内边距/页面内边距', noteLabelsAll.join('|') === '行间距|字号|内容内边距|页面内边距', noteLabelsAll.join('|'))
    // 两个 .wb-gap2 块各自的 2 列均在同一行
    const b1 = noteGap.nth(0).locator('.wb-gap2__col')
    const nb1a = await b1.nth(0).boundingBox()
    const nb1b = await b1.nth(1).boundingBox()
    ok('记事·排版第1块两列同行', !!nb1a && !!nb1b && Math.abs((nb1a.y + nb1a.height / 2) - (nb1b.y + nb1b.height / 2)) < 5)
    const b2 = noteGap.nth(1).locator('.wb-gap2__col')
    const nb2a = await b2.nth(0).boundingBox()
    const nb2b = await b2.nth(1).boundingBox()
    ok('记事·排版第2块两列同行', !!nb2a && !!nb2b && Math.abs((nb2a.y + nb2a.height / 2) - (nb2b.y + nb2b.height / 2)) < 5)
    ok('记事·排版保留两条说明', (await body.locator('.wb-muted').count()) >= 2)
    await closePop()

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
