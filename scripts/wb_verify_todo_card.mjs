// 验证：待办卡片 — 设置页分类管理 + 标题栏(分类下拉/已完成/剩余数) + 列表(去收藏/小圆角/悬浮主色/计数上移)
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'

const results = []
const log = (ok, step, detail) => { results.push({ ok, step }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const pg = await ctx.newPage()
const errors = []
pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })

try {
  // 登录
  const res = await pg.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ username: USER, password: PASS, remember: true }),
  })
  const j = await res.json()
  log(j.status === 'ok', 'login', `status=${j.status}`)

  await pg.goto(BASE + '/', { waitUntil: 'networkidle' })
  // 进入工作台视图
  await pg.getByText('工作台', { exact: true }).first().click()
  await pg.waitForSelector('.wb-grid', { timeout: 15000 })
  await sleep(300)

  const todoCard = pg.locator('.wb-cell[data-id="todo"]')
  await todoCard.waitFor({ timeout: 10000 })
  const todoRight = todoCard.locator('.wb-card__right')

  // 先添加一条待办，保证列表有项可测
  const addBtn = todoRight.locator('button[aria-label="添加待办"]')
  await addBtn.click()
  await pg.waitForSelector('.wb-pop:has(textarea.wb-note)', { timeout: 6000 })
  await pg.locator('.wb-pop textarea.wb-note').fill('验证用待办A')
  await pg.locator('.wb-pop:has(textarea.wb-note)').getByRole('button', { name: '添加', exact: true }).click()
  await sleep(250)

  // (B) 标题栏：分类下拉 + 已完成 + 剩余计数 + 添加按钮
  const hasFilter = await todoRight.locator('.wb-todo__filter-sel .select-trigger').count()
  log(hasFilter === 1, 'B-filter-select', `分类下拉数量=${hasFilter}`)
  const hasDoneBtn = await todoRight.locator('button[aria-label="已完成"]').count()
  log(hasDoneBtn === 1, 'B-done-btn', `已完成按钮数量=${hasDoneBtn}`)
  const hasAdd = await todoRight.locator('button[aria-label="添加待办"]').count()
  log(hasAdd === 1, 'B-add-btn', `添加按钮数量=${hasAdd}`)
  const countTxt = (await todoRight.locator('.wb-todo__count').innerText().catch(() => '')) || ''
  log(/^\d+$/.test(countTxt.trim()), 'B-count-number', `剩余计数文本="${countTxt}"（应为纯数字）`)

  // (B-选项) 打开分类下拉，确认含 全部 + 三分类
  await todoRight.locator('.wb-todo__filter-sel .select-trigger').click()
  await sleep(200)
  const optTxt = await pg.locator('.select-pop--portal.open .select-opt').allInnerTexts()
  const joined = optTxt.join(',').replace(/\s+/g, '')
  log(joined.includes('全部') && joined.includes('工作') && joined.includes('生活') && joined.includes('其他'),
    'B-filter-options', `下拉项=${joined}`)
  await pg.keyboard.press('Escape')
  await sleep(150)

  // (C) 列表无收藏(星)图标
  const starCount = await todoCard.locator('.wb-todo__star').count()
  log(starCount === 0, 'C-no-star', `星标图标数量=${starCount}（应为0）`)

  // (D) 点选方框小圆角
  const radius = await todoCard.locator('.wb-todo__check').first().evaluate((el) => {
    const r = getComputedStyle(el).borderTopLeftRadius
    return parseFloat(r)
  })
  log(radius > 0 && radius < 5, 'D-small-radius', `checkbox 圆角=${radius}px（期望 <5px）`)

  // (E) 悬浮待办项 → 文字与图标主色
  const primaryRgb = await pg.evaluate(() => {
    const el = document.createElement('span')
    el.style.color = 'hsl(var(--p))'
    document.body.appendChild(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  })
  const li = todoCard.locator('.wb-todo__list li').first()
  const beforeColor = await li.locator('.wb-todo__text').evaluate((el) => getComputedStyle(el).color)
  await li.hover()
  await sleep(150)
  const afterText = await li.locator('.wb-todo__text').evaluate((el) => getComputedStyle(el).color)
  const afterCheck = await li.locator('.wb-todo__check').evaluate((el) => getComputedStyle(el).color)
  log(afterText === primaryRgb, 'E-hover-text-primary', `悬浮文字色=${afterText} 主色=${primaryRgb}`)
  log(afterCheck === primaryRgb, 'E-hover-check-primary', `悬浮方框色=${afterCheck} 主色=${primaryRgb}`)
  log(beforeColor !== afterText, 'E-hover-changed', `悬浮前=${beforeColor} 悬浮后=${afterText}`)

  // (F) 底部「剩余 N 项」已移除，计数已上移标题栏（前面已验证 .wb-todo__count 存在）
  const footCount = await todoCard.locator('.wb-todo__foot').count()
  log(footCount === 0, 'F-no-footer', `底部剩余文案数量=${footCount}（应为0）`)

  // 已完成弹窗：把刚才的待办标记完成，确认弹窗展示
  await li.locator('.wb-todo__check').click()
  await sleep(200)
  await todoRight.locator('button[aria-label="已完成"]').click()
  await pg.waitForSelector('.wb-pop--done', { timeout: 6000 })
  const doneModalTxt = await pg.locator('.wb-pop--done').innerText()
  log(doneModalTxt.includes('验证用待办A'), 'done-modal-shows', `弹窗含已完成项=${doneModalTxt.includes('验证用待办A')}`)
  await pg.locator('.wb-pop--done button[aria-label="关闭"]').click()
  await sleep(150)

  // (A) 设置页：进入编辑态 → 打开待办卡片设置 → 分类管理
  await pg.locator('button[aria-label="编辑工作台"]').click()
  await sleep(250)
  await todoCard.locator('button[aria-label="设置"]').click()
  await pg.waitForSelector('.wb-tsort', { timeout: 6000 })
  const rows0 = await pg.locator('.wb-tsort__row').count()
  log(rows0 === 3, 'A-cat-rows', `初始分类行数=${rows0}（期望3）`)
  const draggable = await pg.locator('.wb-tsort__row').first().getAttribute('draggable')
  log(draggable === 'true', 'A-draggable', `draggable=${draggable}`)
  const hasHandle = await pg.locator('.wb-tsort__row .wb-tsort__handle').count()
  log(hasHandle === rows0, 'A-drag-handle', `拖拽手柄数=${hasHandle}`)
  const renameBtns = await pg.locator('.wb-tsort__row button[aria-label="重命名"]').count()
  const delBtns = await pg.locator('.wb-tsort__row button[aria-label="删除"]').count()
  log(renameBtns === rows0 && delBtns === rows0, 'A-rename-delete-btns', `重命名=${renameBtns} 删除=${delBtns}`)

  // 新增分类 → 行数 +1，且标题栏下拉出现新选项
  const newCat = '测试分类X'
  await pg.locator('input[placeholder="新分类名称"]').fill(newCat)
  await pg.locator('.wb-row:has(input[placeholder="新分类名称"]) button').click()
  await sleep(250)
  const rows1 = await pg.locator('.wb-tsort__row').count()
  log(rows1 === rows0 + 1, 'A-add-cat', `新增后分类行数=${rows1}（期望${rows0 + 1}）`)

  // 退出设置，回到卡片，打开标题栏分类下拉确认新分类出现
  await pg.keyboard.press('Escape')
  await sleep(200)
  await todoRight.locator('.wb-todo__filter-sel .select-trigger').click()
  await sleep(200)
  const optTxt2 = (await pg.locator('.select-pop--portal.open .select-opt').allInnerTexts()).join(',').replace(/\s+/g, '')
  log(optTxt2.includes(newCat), 'A-new-cat-in-filter', `下拉含新分类=${optTxt2.includes(newCat)}（${optTxt2}）`)
  await pg.keyboard.press('Escape')

  log(errors.length === 0, 'no-console-errors', errors.length ? errors.join(' | ') : '无')
} catch (e) {
  log(false, 'exception', e.message)
} finally {
  const pass = results.filter((r) => r.ok).length
  console.log(`\n汇总：${pass}/${results.length} 通过`)
  await browser.close()
  process.exit(pass === results.length ? 0 : 1)
}
