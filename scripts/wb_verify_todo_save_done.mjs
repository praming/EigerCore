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
function alpha(c) { const m = c.match(/[\d.]+/g); return +(m[3] ?? 1) }

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

    // 通用：hover 后背景是否非透明
    const hoverBgAlpha = async (loc) => {
      await loc.hover()
      await page.waitForTimeout(250)
      return alpha(await loc.evaluate((el) => getComputedStyle(el).backgroundColor))
    }

    // ===== 1) 待办「添加」按钮 hover 背景（修复点）=====
    await page.locator('.wb-cell__btn[aria-label="添加待办"]').click()
    await page.waitForTimeout(300)
    const todoAdd = page.locator('.wb-pop').getByRole('button', { name: '添加', exact: true })
    const a1 = await hoverBgAlpha(todoAdd)
    ok('待办「添加」按钮 hover 有背景', a1 > 0.01, `bgAlpha=${a1}`)
    await page.locator('.wb-cell__btn[aria-label="关闭"]').first().click()
    await page.waitForTimeout(200)

    // ===== 2) 链接卡片「添加」按钮 hover 背景（跨卡片验证全局规则）=====
    await page.locator('.wb-cell__btn[aria-label="添加链接"]').click()
    await page.waitForTimeout(300)
    const linkAdd = page.locator('.wb-pop').getByRole('button', { name: '添加', exact: true })
    const a2 = await hoverBgAlpha(linkAdd)
    ok('链接卡片「添加」按钮 hover 有背景（全局修复）', a2 > 0.01, `bgAlpha=${a2}`)
    await page.locator('.wb-cell__btn[aria-label="关闭"]').first().click()
    await page.waitForTimeout(200)

    // ===== 3) 已完成按钮图标 = square-check-big =====
    const actBtn = page.locator('.wb-cell__btn[aria-label="已完成"]')
    const iconCls = await actBtn.locator('svg').getAttribute('class')
    ok('已完成按钮图标=square-check-big', (iconCls || '').includes('lucide-square-check-big'), iconCls)

    // ===== 4-7) 已完成弹窗：min-height / 单复选框 / 灰字删除线 / 点击恢复 =====
    const title = '完成hover' + Date.now()
    await page.locator('.wb-cell__btn[aria-label="添加待办"]').click()
    await page.waitForTimeout(300)
    await page.locator('.wb-pop textarea.wb-note').fill(title)
    await page.locator('.wb-pop').getByRole('button', { name: '添加', exact: true }).click()
    await page.waitForTimeout(400)
    // 标记完成：点击活动列表项的文本
    await page.locator('.wb-todo__list li', { hasText: title }).locator('.wb-todo__text').click()
    await page.waitForTimeout(300)
    // 打开已完成弹窗
    await actBtn.click()
    await page.waitForTimeout(300)

    const pop = page.locator('.wb-pop--done')
    const box = await pop.boundingBox()
    const vh = page.viewportSize().height
    ok('已完成弹窗 min-height≥50vh', box.height >= vh * 0.5 - 5, `h=${Math.round(box.height)} vh=${vh}`)

    const li = page.locator('.wb-pop--done .wb-todo__list li').first()
    const cbCount = await li.locator('input[type=checkbox]').count()
    const isDoneBtn = await li.locator('button.wb-todo__check.is-done').count()
    ok('已完成项仅 1 个选择方框', cbCount === 1, `checkbox=${cbCount}`)
    ok('已完成项无第二个恢复方框', isDoneBtn === 0, `isDoneBtn=${isDoneBtn}`)

    const txt = li.locator('.wb-todo__text.done')
    const cs = await txt.evaluate((el) => {
      const s = getComputedStyle(el)
      return { deco: s.textDecorationLine, color: s.color }
    })
    ok('已完成项删除线', (cs.deco || '').includes('line-through'), `deco=${cs.deco}`)
    ok('已完成项灰色字体', alpha(cs.color) < 0.6, `color=${cs.color}`)

    // 点击事项文本 → 恢复到未完成（离开已完成列表）
    const before = await page.locator('.wb-pop--done .wb-todo__list li').count()
    await txt.click()
    await page.waitForTimeout(300)
    const after = await page.locator('.wb-pop--done .wb-todo__list li').count()
    ok('点击已完成项文本可恢复（列表减少）', after === before - 1, `before=${before} after=${after}`)

    console.log(results.join('\n'))
    const failed = results.filter((r) => r.startsWith('FAIL')).length
    console.log(`\n汇总: ${results.length - failed}/${results.length} 通过`)
    process.exit(failed ? 1 : 0)
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error('ERR', e); process.exit(2) })
