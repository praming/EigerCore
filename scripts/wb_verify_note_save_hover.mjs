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
// 解析 rgba(...) -> [r,g,b,a]
function parseRGBA(c) {
  const m = c.match(/[\d.]+/g)
  return [+m[0], +m[1], +m[2], +(m[3] ?? 1)]
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    channel: 'msedge',
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const loginRes = await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const bgOf = async (loc) => parseRGBA(await loc.evaluate((el) => getComputedStyle(el).backgroundColor))
    const isTransparent = (c) => c[3] === 0
    const hasFill = (c) => c[3] > 0.01

    // ===== 新建页面保存按钮 hover =====
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    const createSave = page.locator('button.wb-note__save', { hasText: '保存' }).first()
    ok('新建页存在保存按钮(.wb-note__save)', (await createSave.count()) === 1)
    const cNormal = await bgOf(createSave)
    ok('新建页保存按钮常态无背景', isTransparent(cNormal), `bg=${cNormal}`)
    await createSave.hover()
    await page.waitForTimeout(300)
    const cHover = await bgOf(createSave)
    ok('新建页保存按钮 hover 有背景', hasFill(cHover), `bg=${cHover}`)
    // 关闭新建弹窗
    await page.locator('button.wb-cell__btn[aria-label="关闭"]').first().click()
    await page.waitForTimeout(300)

    // ===== 编辑页面保存按钮 hover =====
    // 新建一条笔记以便进入编辑态
    const title = '保存hover' + Date.now()
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    await page.locator('.wb-pop--note input.wb-input').first().fill(title)
    await page.locator('.wb-pop--note textarea.wb-note').fill('用于验证保存按钮 hover 背景色')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(400)
    await page.locator('.wb-note__item', { hasText: title }).click()
    await page.waitForTimeout(300)
    // 点编辑（头部左侧 pencil）
    await page.locator('.wb-note__head button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)
    const editSave = page.locator('button.wb-note__save', { hasText: '保存' }).first()
    ok('编辑页存在保存按钮(.wb-note__save)', (await editSave.count()) === 1)
    const eNormal = await bgOf(editSave)
    ok('编辑页保存按钮常态无背景', isTransparent(eNormal), `bg=${eNormal}`)
    await editSave.hover()
    await page.waitForTimeout(300)
    const eHover = await bgOf(editSave)
    ok('编辑页保存按钮 hover 有背景', hasFill(eHover), `bg=${eHover}`)
    // 关闭弹窗收尾
    await page.locator('button.wb-cell__btn[aria-label="关闭"]').first().click()
    await page.waitForTimeout(200)

    console.log(results.join('\n'))
    const failed = results.filter((r) => r.startsWith('FAIL')).length
    console.log(`\n汇总: ${results.length - failed}/${results.length} 通过`)
    process.exit(failed ? 1 : 0)
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error('ERR', e); process.exit(2) })
