import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000/'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
function ok(name, cond, info = '') { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`) }
function rgb(c) { const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]] }

const run = async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', channel: 'msedge' })
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

    // 新建一条唯一标题的笔记（用于删除/撤销与内边距验证）
    const title = 'padundo_' + Date.now()
    await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
    await page.waitForTimeout(300)
    await page.locator('.wb-pop--note input.wb-input').first().fill(title)
    await page.locator('.wb-pop--note textarea.wb-note').fill('用于验证内边距与撤销条的内容正文')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(400)
    ok('笔记已新建', (await page.locator('.wb-note__item', { hasText: title }).count()) > 0)

    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    const openNoteSettings = async () => {
      if ((await editBtn.getAttribute('aria-label')) !== '退出编辑') { await editBtn.click(); await page.waitForTimeout(400) }
      await page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]').first().click()
      await page.waitForTimeout(400)
    }
    const closeNoteSettings = async () => {
      await page.locator('.wb-pop__mask').last().locator('button[aria-label="关闭"]').click().catch(() => {})
      await page.waitForTimeout(300)
      if ((await editBtn.getAttribute('aria-label')) === '退出编辑') { await editBtn.click(); await page.waitForTimeout(300) }
    }
    const setNoteInput = async (label, val) => {
      const input = page.locator('.wb-row', { hasText: label }).locator('input')
      await input.fill(String(val))
      await input.dispatchEvent('change')
      await input.press('Tab')
      await page.waitForTimeout(250)
    }
    const openDetail = async () => {
      await page.locator('.wb-note__item', { hasText: title }).click()
      await page.waitForTimeout(400)
      const d = page.locator('.wb-pop--note')
      ok('详情弹窗打开', (await d.count()) > 0)
      return d
    }

    // ========== 内边距相互独立验证 ==========

    // 1) 内容内边距=40，页面内边距=0
    await openNoteSettings()
    await setNoteInput('内容内边距', 40)
    await setNoteInput('页面内边距', 0)
    await closeNoteSettings()
    let d = await openDetail()
    let m1 = await d.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        outerVar: cs.getPropertyValue('--note-outer-pad').trim(),
        outerPad: parseFloat(cs.paddingLeft),
        bodyPad: parseFloat(getComputedStyle(el.querySelector('.wb-pop__body')).paddingLeft),
      }
    })
    ok('页面内边距=0 → 弹窗外框 padding=0', m1.outerPad === 0, `outer=${m1.outerPad}`)
    ok('内容内边距=40 → 正文 padding=40', Math.abs(m1.bodyPad - 40) < 1.5, `body=${m1.bodyPad.toFixed(1)}`)
    ok('CSS变量 --note-outer-pad=0px', m1.outerVar === '0px', `--note-outer-pad=${m1.outerVar}`)
    await d.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // 2) 内容内边距保持 40，页面内边距=30
    await openNoteSettings()
    await setNoteInput('页面内边距', 30)
    await closeNoteSettings()
    d = await openDetail()
    let m2 = await d.evaluate((el) => ({
      outerPad: parseFloat(getComputedStyle(el).paddingLeft),
      bodyPad: parseFloat(getComputedStyle(el.querySelector('.wb-pop__body')).paddingLeft),
    }))
    ok('页面内边距=30 → 弹窗外框 padding=30（仅外层变化）', m2.outerPad === 30, `outer=${m2.outerPad}`)
    ok('内容内边距不变 → 正文 padding 仍为 40', Math.abs(m2.bodyPad - 40) < 1.5, `body=${m2.bodyPad.toFixed(1)}`)
    await d.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // 3) 内容内边距=10，页面内边距=50
    await openNoteSettings()
    await setNoteInput('内容内边距', 10)
    await setNoteInput('页面内边距', 50)
    await closeNoteSettings()
    d = await openDetail()
    let m3 = await d.evaluate((el) => ({
      outerPad: parseFloat(getComputedStyle(el).paddingLeft),
      bodyPad: parseFloat(getComputedStyle(el.querySelector('.wb-pop__body')).paddingLeft),
    }))
    ok('页面内边距=50 → 弹窗外框 padding=50', m3.outerPad === 50, `outer=${m3.outerPad}`)
    ok('内容内边距=10 → 正文 padding=10', Math.abs(m3.bodyPad - 10) < 1.5, `body=${m3.bodyPad.toFixed(1)}`)

    // ========== 撤销条为红色验证 ==========
    // 当前详情弹窗已打开；点删除进入「已删除」态
    await d.locator('button[aria-label="删除"]').click()
    await page.waitForTimeout(350)
    const undoBar = page.locator('.wb-note__undo')
    ok('撤销条出现', (await undoBar.count()) > 0)
    const btnBg = rgb(await undoBar.locator('.wb-note__undo-btn').evaluate((el) => getComputedStyle(el).backgroundColor))
    const barBg = rgb(await undoBar.evaluate((el) => getComputedStyle(el).backgroundColor))
    const txtCol = rgb(await undoBar.locator('.wb-note__undo-text').evaluate((el) => getComputedStyle(el).color))
    ok('撤销按钮背景为红色', btnBg[0] > 120 && btnBg[0] > btnBg[1] + 40 && btnBg[0] > btnBg[2] + 40, `rgb=${btnBg}`)
    ok('撤销条背景为红调', barBg[0] > barBg[1] && barBg[0] > barBg[2], `rgb=${barBg}`)
    ok('撤销文字为红色', txtCol[0] > 120 && txtCol[0] > txtCol[1] + 30 && txtCol[0] > txtCol[2] + 30, `rgb=${txtCol}`)
    // 点撤销恢复笔记
    await undoBar.locator('.wb-note__undo-btn').click()
    await page.waitForTimeout(400)
    ok('撤销后笔记恢复（详情正常显示）', (await page.locator('.wb-note__detail-body').count()) > 0)
    await d.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    ok('无控制台 error（忽略预拉取 401）', errors.filter((e) => !/401|UNAUTHORIZED/i.test(e)).length === 0, `errors=${errors.length}`)

    console.log('\n==== 记事本 内边距(内容/页面)相互独立 + 撤销条红色 验证 ====')
    console.log(results.join('\n'))
    const failed = results.filter((r) => r.startsWith('FAIL'))
    console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
    await browser.close()
    process.exit(failed.length ? 1 : 0)
  } catch (e) {
    console.log(results.join('\n'))
    console.error('ERROR', e)
    await browser.close()
    process.exit(2)
  }
}
run()
