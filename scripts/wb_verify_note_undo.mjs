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
function rgb(c) {
  const m = c.match(/[\d.]+/g)
  return [+m[0], +m[1], +m[2]]
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    channel: 'msedge',
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const loginRes = await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    // 新建一条唯一标题的笔记
    const title = '撤销测试' + Date.now()
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    await page.locator('.wb-pop--note input.wb-input').first().fill(title)
    await page.locator('.wb-pop--note textarea.wb-note').fill('用于验证软删除与撤销的测试正文')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(400)
    ok('笔记已新建', (await page.locator('.wb-note__item', { hasText: title }).count()) > 0)

    // 打开详情
    await page.locator('.wb-note__item', { hasText: title }).click()
    await page.waitForTimeout(400)
    const pop = page.locator('.wb-pop--note')
    ok('详情弹窗打开', (await pop.count()) > 0)

    const del = pop.locator('button[aria-label="删除"]')
    const close = pop.locator('button[aria-label="关闭"]')
    const edit = pop.locator('button[aria-label="编辑"]')

    // 1) 布局：删除/编辑在左侧（x 小于关闭）
    const delBox = await del.boundingBox()
    const closeBox = await close.boundingBox()
    ok('删除在关闭左侧（已移出右侧热区）', delBox.x < closeBox.x, `del.x=${Math.round(delBox.x)} close.x=${Math.round(closeBox.x)}`)
    const editBox = await edit.boundingBox()
    ok('编辑也在关闭左侧', editBox.x < closeBox.x)

    // 2) 删除默认不显红、hover 转红
    const defColor = rgb(await del.evaluate((e) => getComputedStyle(e).color))
    ok('删除默认不显红（灰调）', Math.abs(defColor[0] - defColor[1]) < 60, `rgb=${defColor}`)
    await del.hover()
    await page.waitForTimeout(250)
    const hovColor = rgb(await del.evaluate((e) => getComputedStyle(e).color))
    ok('删除 hover 转红', hovColor[0] - hovColor[1] > 100, `rgb=${hovColor}`)
    await page.mouse.move(10, 10)
    await page.waitForTimeout(150)

    // 3) 点删除 → 软删除态
    await del.click()
    await page.waitForTimeout(300)
    ok('点删除后撤销条出现', (await page.locator('.wb-note__undo').count()) > 0)
    ok('点删除后弹窗仍开（保留已删除态）', (await pop.count()) > 0)
    ok('点删除后显示已删除占位', await page.locator('.wb-note__deleted').isVisible())
    ok('点删除后列表项消失', (await page.locator('.wb-note__item', { hasText: title }).count()) === 0)

    // 4) 撤销 → 恢复
    await page.locator('.wb-note__undo-btn').click()
    await page.waitForTimeout(300)
    ok('撤销后撤销条消失', (await page.locator('.wb-note__undo').count()) === 0)
    ok('撤销后列表项重现', (await page.locator('.wb-note__item', { hasText: title }).count()) > 0)
    ok('撤销后详情恢复正常（标题可见）', await pop.locator('.wb-note__head-title', { hasText: title }).isVisible())

    // 5) 再删 + 不撤销 + 等 5s → 真删
    await pop.locator('button[aria-label="删除"]').click()
    await page.waitForTimeout(5600)
    ok('超时后弹窗关闭', (await pop.count()) === 0)
    ok('超时后列表项真正删除', (await page.locator('.wb-note__item', { hasText: title }).count()) === 0)

    ok('无控制台 error', errors.length === 0, errors.slice(0, 2).join(' | '))
  } catch (e) {
    ok('脚本异常', false, String(e).slice(0, 200))
  } finally {
    await browser.close()
  }

  const pass = results.filter((r) => r.startsWith('PASS')).length
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass}/${results.length}`)
  process.exit(pass === results.length ? 0 : 1)
}
run()
