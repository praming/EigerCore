import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const pg = await browser.newPage()

const errors = []
pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name) }
}

// 先登录建立会话，再进首页（避免未登录首屏 401 噪音）
await pg.request.post(`${BASE}/api/login`, {
  headers: { 'Content-Type': 'application/json', '_wants_json': '1' },
  data: { username: 'wb_probe_sys', password: 'probe1234' },
})
await pg.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.cat-switch .cat-btn', { timeout: 15000 })

// 进工作台
await pg.click('.cat-switch .cat-btn[title="工作台"]')
await pg.waitForSelector('.wb-cal', { timeout: 10000 })

// 1) 工具箱不再有「万年历」tab
const toolTabs = await pg.$$eval('.wb-tools .wb-tool__tabs .wb-tool__tab', (els) => els.map((e) => e.textContent.trim()))
check('工具箱已无「万年历」tab', !toolTabs.some((t) => t.includes('万年历')))

// 2) 日历日期格可点击，点今天弹出万年历详情
const todayBtn = await pg.$('.wb-cal__cell.is-today.is-clickable')
check('今天日期格存在且可点击', !!todayBtn)
if (todayBtn) {
  await todayBtn.click()
  await pg.waitForSelector('dialog.modal[open] .wb-wanli', { timeout: 8000 })
}
const hasWanli = await pg.$('dialog.modal[open] .wb-wanli') !== null
check('点击日期弹出万年历详情(.wb-wanli)', hasWanli)

// 3) 弹窗含宜/忌、干支、方位等关键信息
const detailText = await pg.$eval('dialog.modal[open] .wb-wanli', (el) => el.textContent || '')
check('详情含「宜」', detailText.includes('宜'))
check('详情含「忌」', detailText.includes('忌'))
check('详情含「详细信息」', detailText.includes('详细信息'))
check('详情含「生肖」', detailText.includes('生肖'))
check('详情含「伊斯兰历」', detailText.includes('伊斯兰历'))
check('详情含「节气」', detailText.includes('节气'))

// 4) 关闭弹窗
await pg.click('dialog.modal[open] .wb-cal-detail__close')
await pg.waitForSelector('dialog.modal[open] .wb-wanli', { state: 'detached', timeout: 5000 }).catch(() => {})
const closed = (await pg.$('dialog.modal[open]')) === null
check('弹窗可关闭', closed)

// 5) 编辑态点击不弹窗
// 进入编辑态：点击顶栏编辑按钮（文本含 编辑/完成）
const editBtn = await pg.$('button:has-text("编辑"), button:has-text("完成"), [title*="编辑"]')
let enteredEdit = false
if (editBtn) {
  await editBtn.click({ timeout: 3000 }).catch(() => {})
  await pg.waitForTimeout(400)
  enteredEdit = (await pg.$('.wb-cell--edit')) !== null
}
check('已进入编辑态(.wb-cell--edit)', enteredEdit)
// 编辑态下点击日期格：被编辑外壳拦截（pointer-events）或 openDetail guard 拦截——短超时避免卡死
let openedInEdit = false
const someCell = await pg.$('.wb-cal__cell.is-clickable')
if (someCell && enteredEdit) {
  await someCell.click({ timeout: 2000 }).catch(() => {})
  await pg.waitForTimeout(400)
  openedInEdit = (await pg.$('dialog.modal[open] .wb-wanli')) !== null
}
check('编辑态点击日期不弹窗', !openedInEdit)
// 退出编辑态
if (editBtn) { await editBtn.click({ timeout: 3000 }).catch(() => {}) }
await pg.waitForTimeout(300)

check('no-console-errors', errors.length === 0)
if (errors.length) console.log('CONSOLE ERRORS:', errors.slice(0, 5))

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
await browser.close()
process.exit(fail ? 1 : 0)
