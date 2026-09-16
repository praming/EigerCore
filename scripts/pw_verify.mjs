import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core')

const BASE = 'http://127.0.0.1:5000'
const OUT = 'D:/wwwroot/workbuddy/python-nav/_pw_shots'
fs.mkdirSync(OUT, { recursive: true })

const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const edgePath = EDGE_PATHS.find((p) => fs.existsSync(p))

const errors = []
const log = (...a) => console.log(...a)

const browser = await chromium.launch({
  executablePath: edgePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))

const uname = 'wb_verify_' + Date.now().toString().slice(-6)
const pwd = 'WbVerify@123'

try {
  // 1) 注册
  log('-> register', uname)
  await page.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await page.fill('input[name="username"]', uname)
  await page.fill('input[name="password"]', pwd)
  await page.fill('input[name="confirm"]', pwd)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1200)

  // 2) 登录
  log('-> login')
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="username"]', uname)
  await page.fill('input[name="password"]', pwd)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)

  // 3) SPA 主页
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-shell', { timeout: 15000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: OUT + '/01_home.png' })
  log('home loaded')

  // 4) 设置抽屉（验证 WbSwitch 渲染）
  await page.click('button[aria-label="设置"]')
  await page.waitForTimeout(700)
  const wbSwitchCount = await page.locator('.wb-switch').count()
  log('WbSwitch count in settings =', wbSwitchCount)
  await page.screenshot({ path: OUT + '/02_settings_drawer.png' })

  // 5) 切到工作台：开启「默认进入工作台」并保存
  //    设置抽屉内该开关是 .wb-switch（与“显示删除”等并列）
  const wbToggle = page.locator('label:has-text("默认进入工作台页面") .wb-switch').first()
  if (await wbToggle.count()) {
    const on = await wbToggle.getAttribute('class')
    if (!on || !on.includes('is-on')) {
      await wbToggle.click()
      await page.waitForTimeout(300)
    }
  }
  // 点击保存（文本为 保存 的按钮）
  const saveBtn = page.locator('button:has-text("保存")').first()
  if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(500) }
  await page.waitForTimeout(400)

  // 6) 重载进入工作台
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.wb-title', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
  await page.screenshot({ path: OUT + '/03_workbench.png' })

  // 7) 打开组件库，添加倒数日
  const libBtn = page.locator('button[aria-label="小组件库"]')
  if (await libBtn.count()) {
    await libBtn.click()
    await page.waitForTimeout(600)
    // “添加组件”区：找名称含「倒数日」的卡片，点其 + 按钮
    const addCard = page.locator('.wb-lib__addcard', { hasText: '倒数日' }).first()
    if (await addCard.count()) {
      await addCard.locator('.wb-lib__addbtn').click()
      await page.waitForTimeout(900)
      log('daycount widget added, instances hint =', await page.locator('.wb-lib__count').first().textContent())
    } else {
      log('WARN: daycount addcard not found')
    }
    // 关闭组件库
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: OUT + '/04_after_add_daycount.png' })

  // 8) 进入工作台编辑态，使卡片齿轮可见
  const editBtn = page.locator('button[aria-label="编辑工作台"]')
  if (await editBtn.count()) {
    await editBtn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: OUT + '/04b_workbench_edit.png' })

  // 9) 打开倒数日卡片设置（齿轮，位于 .wb-cell 内、daycount 卡片专属）
  const cardGear = page.locator('.wb-cell:has(.wb-dc__list) .wb-cell__btn[aria-label="设置"]').first()
  if (await cardGear.count()) {
    await cardGear.click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: OUT + '/05_daycount_settings.png' })

    // 10) 选重复模式为「每年农历重复」
    const repeatRow = page.locator('.wb-row:has-text("重复")').first()
    await repeatRow.locator('.select-trigger').click()
    await page.waitForTimeout(400)
    const lunarOpt = page.locator('.select-pop .select-opt', { hasText: '农历' }).first()
    if (await lunarOpt.count()) {
      await lunarOpt.click()
      await page.waitForTimeout(600)
      const lunarMonthVisible = await page.getByText('农历月', { exact: false }).count()
      const lunarDayVisible = await page.getByText('农历日', { exact: false }).count()
      log('lunar 农历月 visible =', lunarMonthVisible, ' 农历日 visible =', lunarDayVisible)
      await page.screenshot({ path: OUT + '/06_daycount_lunar.png' })
    } else {
      log('WARN: lunar option not found in repeat dropdown')
      await page.screenshot({ path: OUT + '/06_repeat_no_lunar.png' })
    }
  } else {
    log('WARN: daycount card gear not found')
  }
} catch (e) {
  errors.push('[script] ' + e.message)
  log('SCRIPT ERROR', e.message)
} finally {
  await browser.close()
  fs.writeFileSync(OUT + '/errors.txt', errors.join('\n') || 'NO_ERRORS')
  log('=== DONE. errors:', errors.length, '===')
  log(errors.join('\n'))
}
