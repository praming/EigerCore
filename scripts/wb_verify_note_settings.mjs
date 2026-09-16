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
    page.on('console', () => {})

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const api = ctx.request
    const csrf = await (await api.get('http://127.0.0.1:5000/api/csrf-token')).json()
    const loginRes = await api.post('http://127.0.0.1:5000/api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    // 确保至少有一条笔记
    const items = page.locator('.wb-note__item')
    if (await items.count() === 0) {
      await page.locator('.wb-cell__btn[aria-label="新建记事"]').click()
      await page.waitForTimeout(300)
      await page.locator('.wb-pop--note input.wb-input').first().fill('验证笔记')
      await page.locator('.wb-pop--note textarea.wb-note').fill('内容正文用于测试字号与内边距')
      await page.getByRole('button', { name: '保存' }).click()
      await page.waitForTimeout(400)
    }

    const titleFs = async () => page.locator('.wb-note__title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    const setNoteInput = async (label, val) => {
      const input = page.locator('.wb-row', { hasText: label }).locator('input')
      await input.fill(String(val))
      await input.dispatchEvent('change')
      await input.press('Tab')
      await page.waitForTimeout(250)
    }

    // —— 进入编辑 + 记事本设置 ——
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    if ((await editBtn.getAttribute('aria-label')) !== '退出编辑') { await editBtn.click(); await page.waitForTimeout(400) }
    await page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]').first().click()
    await page.waitForTimeout(400)

    // 默认弹窗内边距应为 32px（构造默认）
    const padInputVal = await page.locator('.wb-row', { hasText: '弹窗内边距' }).locator('input').inputValue()
    ok('设置页存在「弹窗内边距」输入', await page.locator('.wb-row', { hasText: '弹窗内边距' }).count() > 0, `value=${padInputVal}`)
    ok('设置页存在「字号」输入', await page.locator('.wb-row', { hasText: '字号' }).count() > 0)

    // —— 字号：设为 22，列表标题字号应跟随 ——
    await setNoteInput('字号', 22)
    const fs22 = await titleFs()
    ok('字号=22 → 列表标题字号≈22px', Math.abs(fs22 - 22) < 1.5, `fs=${fs22.toFixed(1)}px`)

    // —— 字号：设为 13，列表标题字号应跟随 ——
    await setNoteInput('字号', 13)
    const fs13 = await titleFs()
    ok('字号=13 → 列表标题字号≈13px', Math.abs(fs13 - 13) < 1.5, `fs=${fs13.toFixed(1)}px`)

    // 恢复 14
    await setNoteInput('字号', 14)

    // —— 弹窗内边距：设为 50，详情正文 padding 应跟随 ——
    await setNoteInput('弹窗内边距', 50)
    // 关闭设置 + 退出编辑
    await page.locator('.wb-pop__mask').last().locator('button[aria-label="关闭"]').click().catch(() => {})
    await page.waitForTimeout(300)
    await editBtn.click()
    await page.waitForTimeout(300)

    await items.first().click()
    await page.waitForTimeout(400)
    const d = page.locator('.wb-pop--note')
    ok('详情弹窗打开', await d.count() > 0)
    const padInfo = await d.evaluate((el) => {
      const cs = getComputedStyle(el)
      const varVal = cs.getPropertyValue('--note-pad').trim()
      const body = el.querySelector('.wb-pop__body')
      const bcs = getComputedStyle(body)
      return { varVal, bodyLeft: parseFloat(bcs.paddingLeft), bodyTop: parseFloat(bcs.paddingTop) }
    })
    ok('弹窗 --note-pad=50px', padInfo.varVal === '50px', `--note-pad=${padInfo.varVal}`)
    ok('详情正文左内边距≈50px', Math.abs(padInfo.bodyLeft - 50) < 1.5, `left=${padInfo.bodyLeft.toFixed(1)}px`)
    ok('详情正文上内边距≈50px', Math.abs(padInfo.bodyTop - 50) < 1.5, `top=${padInfo.bodyTop.toFixed(1)}px`)
    await d.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(300)

    // —— 弹窗内边距：设为 24，验证变小 ——
    if ((await editBtn.getAttribute('aria-label')) !== '退出编辑') { await editBtn.click(); await page.waitForTimeout(300) }
    await page.locator('.wb-cell', { hasText: '记事本' }).locator('button[aria-label="设置"]').first().click()
    await page.waitForTimeout(300)
    await setNoteInput('弹窗内边距', 24)
    await page.locator('.wb-pop__mask').last().locator('button[aria-label="关闭"]').click().catch(() => {})
    await page.waitForTimeout(300)
    await editBtn.click()
    await page.waitForTimeout(300)
    await items.first().click()
    await page.waitForTimeout(400)
    const d2 = page.locator('.wb-pop--note')
    const pad24 = await d2.evaluate((el) => parseFloat(getComputedStyle(el.querySelector('.wb-pop__body')).paddingLeft))
    ok('弹窗内边距=24 → 正文左内边距≈24px', Math.abs(pad24 - 24) < 1.5, `left=${pad24.toFixed(1)}px`)
    await d2.locator('button[aria-label="关闭"]').click()
    await page.waitForTimeout(200)

    console.log('\n==== 记事本 字号/弹窗内边距 设置修复验证 ====')
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
