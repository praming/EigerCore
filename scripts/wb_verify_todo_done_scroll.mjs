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
    const api = ctx.request
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const loginRes = await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const longText = '这是一条非常非常长的待办事项文本用于验证省略号截断与横向溢出是否会出现滚动条'
    const shortText = '买菜' + Date.now()

    // 新建两个待办
    for (const t of [shortText, longText]) {
      await page.locator('.wb-cell__btn[aria-label="添加待办"]').click()
      await page.waitForTimeout(250)
      await page.locator('.wb-pop textarea.wb-note').fill(t)
      await page.locator('.wb-pop').getByRole('button', { name: '添加', exact: true }).click()
      await page.waitForTimeout(350)
    }

    // 标记两个待办为已完成（点击活动列表项文本）
    for (const t of [shortText, longText]) {
      await page.locator('.wb-todo__list li', { hasText: t }).locator('.wb-todo__text').click()
      await page.waitForTimeout(250)
    }

    // 打开已完成弹窗
    await page.locator('.wb-cell__btn[aria-label="已完成"]').click()
    await page.waitForTimeout(350)

    const liSel = page.locator('.wb-pop--done .wb-todo__list li')
    const count = await liSel.count()
    ok('已完成弹窗含 2 个事项', count === 2, `count=${count}`)

    // 取带分类的那个（短文本项，默认分类可见）
    const shortLi = liSel.filter({ hasText: shortText })
    const cat = shortLi.locator('.wb-todo__cat')
    const catCount = await cat.count()
    ok('已完成项显示分类 pill', catCount >= 1, `catCount=${catCount}`)

    // 间距：事项文本右缘 与 分类左缘 的距离应很小（< 60px）
    const gapInfo = await shortLi.evaluate((li) => {
      const txt = li.querySelector('.wb-todo__text')
      const c = li.querySelector('.wb-todo__cat')
      if (!txt || !c) return null
      const tr = txt.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      return { gap: cr.left - tr.right }
    })
    ok('事项与分类间距缩小（<60px）', gapInfo && gapInfo.gap >= 0 && gapInfo.gap < 60, `gap=${gapInfo ? gapInfo.gap.toFixed(1) : 'n/a'}px`)

    // 选中第一项 → 测量横向滚动条
    await shortLi.locator('input[type=checkbox]').click()
    await page.waitForTimeout(300)
    const scrollInfo = await page.locator('.wb-pop--done .wb-todo__list').evaluate((el) => ({
      sw: el.scrollWidth, cw: el.clientWidth, hasHScroll: el.scrollWidth > el.clientWidth + 1,
    }))
    ok('选中后列表无横向滚动条', !scrollInfo.hasHScroll, `scrollW=${scrollInfo.sw} clientW=${scrollInfo.cw}`)

    // 选中长文本项 → 同样无横向滚动条（验证省略号截断）
    const longLi = liSel.filter({ hasText: longText })
    await longLi.locator('input[type=checkbox]').click()
    await page.waitForTimeout(300)
    const scrollLong = await page.locator('.wb-pop--done .wb-todo__list').evaluate((el) => ({
      sw: el.scrollWidth, cw: el.clientWidth, hasHScroll: el.scrollWidth > el.clientWidth + 1,
    }))
    ok('长文本选中后列表无横向滚动条', !scrollLong.hasHScroll, `scrollW=${scrollLong.sw} clientW=${scrollLong.cw}`)

    // 弹窗整体 body 也无横向滚动条
    const bodyH = await page.locator('.wb-pop--done .wb-pop__body').evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    ok('已完成弹窗 body 无横向滚动条', !bodyH, `bodyHScroll=${bodyH}`)

    console.log(results.join('\n'))
    const failed = results.filter((r) => r.startsWith('FAIL')).length
    console.log(`\n汇总: ${results.length - failed}/${results.length} 通过`)
    process.exit(failed ? 1 : 0)
  } catch (e) {
    console.log(results.join('\n'))
    console.error('ERROR', e)
    process.exit(2)
  } finally {
    await browser.close()
  }
}
run()
