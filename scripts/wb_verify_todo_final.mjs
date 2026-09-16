import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'
const results = []
const ok = (n, c, extra = '') => results.push(`${c ? 'PASS' : 'FAIL'} | ${n}${extra ? ' | ' + extra : ''}`)
async function step(name, fn) {
  try { await fn() } catch (e) { ok(name, false, 'ERR: ' + (e.message || e).split('\n')[0]) }
}

// 已知种子：4 分类 + 3 待办（2 未完成→remain=2；1 已完成→已完成弹窗 1 条）
const SEED = {
  order: ['time', 'weather', 'countdown', 'calendar', 'watchlist', 'note', 'todo', 'tools', 'links', 'bidding'],
  sizes: {
    time: { w: 3, h: 1 }, weather: { w: 3, h: 1 }, countdown: { w: 3, h: 1 },
    calendar: { w: 3, h: 3 }, watchlist: { w: 3, h: 3 }, note: { w: 3, h: 3 },
    todo: { w: 3, h: 2 }, tools: { w: 3, h: 2 }, links: { w: 3, h: 2 }, bidding: { w: 9, h: 3 },
  },
  prefs: {
    todo: {
      defaultCategory: '工作', showCompleted: true, lineGap: 6, fontSize: 14,
      categories: ['工作', '生活', '其他', '临时'],
      items: [
        { id: 1, text: '写采购合同', done: false, category: '工作', starred: false },
        { id: 2, text: '买菜', done: true, category: '生活', starred: false },
        { id: 3, text: '还书', done: false, category: '其他', starred: false },
      ],
    },
  },
}

const browser = await pw.chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle' })
// CSRF 令牌（PUT 受保护，须带 X-CSRF-Token）
const csrf = await page.evaluate(async () => (await fetch('/api/csrf-token', { credentials: 'include' })).json())

const login = await page.evaluate(async ([u, p, token]) => {
  const r2 = await fetch('/api/login', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': token },
    body: JSON.stringify({ username: u, password: p, remember: true }) })
  return { status: r2.status, ok: r2.ok }
}, [USER, PASS, csrf.token])
ok('登录成功', login.ok && login.status === 200, `status=${login.status}`)

// 写入已知种子状态（带 CSRF），重载使其生效
const putRes = await page.evaluate(async ([seed, token]) => {
  const r = await fetch('/api/workbench/state', { method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': token },
    body: JSON.stringify({ state: seed }) })
  return { status: r.status }
}, [SEED, csrf.token])
ok('种子状态写入成功(PUT 200)', putRes.status === 200, `status=${putRes.status}`)

await page.reload({ waitUntil: 'networkidle' })
await page.getByText('工作台', { exact: true }).first().click()
await page.waitForSelector('.wb-weather-card', { timeout: 15000 })
await page.waitForTimeout(800)

const todoCard = page.locator('.wb-cell[data-id="todo"]')
await todoCard.waitFor({ timeout: 10000 })
ok('待办卡片存在', (await todoCard.count()) === 1)

// B. 标题栏顺序
const rightChildren = await todoCard.locator('.wb-card__right > *').evaluateAll((els) =>
  els.map((el) => ({ tag: el.tagName.toLowerCase(), cls: el.className?.toString?.() || '', label: el.getAttribute('aria-label') || '' })),
)
ok('标题栏含分类下拉(.wb-todo__filter-sel)', rightChildren.some((c) => c.cls.includes('wb-todo__filter-sel')))
const iSel = rightChildren.findIndex((c) => c.cls.includes('wb-todo__filter-sel'))
const iDone = rightChildren.findIndex((c) => c.label === '已完成')
const iCount = rightChildren.findIndex((c) => c.cls.includes('wb-todo__count'))
const iAdd = rightChildren.findIndex((c) => c.label === '添加待办')
ok('标题栏顺序 分类→已完成→计数→添加', iSel > -1 && iDone > -1 && iCount > -1 && iAdd > -1 && iSel < iDone && iDone < iCount && iCount < iAdd,
  `sel=${iSel} done=${iDone} count=${iCount} add=${iAdd}`)
const countTxt = await todoCard.locator('.wb-todo__count').first().innerText()
ok('计数仅显示数字(=remain=2)', /^\s*2\s*$/.test(countTxt), `text="${countTxt}"`)

// C. 无收藏图标
ok('待办列表无收藏图标(.wb-todo__star)', (await todoCard.locator('.wb-todo__star').count()) === 0)

// D. 复选框圆角缩小
const radius = await todoCard.locator('.wb-todo__check').first().evaluate((el) => {
  const s = getComputedStyle(el); return parseFloat(s.borderTopLeftRadius || s.borderRadius)
})
ok('复选框圆角已缩小(<5px)', radius > 0 && radius < 5, `radius=${radius}px`)

// F. 底部「剩余…项」文案移除
const footCount = await todoCard.locator('.wb-todo__foot').count()
const filtersCount = await todoCard.locator('.wb-filters').count()
const remainText = await todoCard.getByText('剩余', { exact: false }).count()
ok('底部「剩余…项」文案已移除', footCount === 0 && filtersCount === 0 && remainText === 0, `foot=${footCount} filters=${filtersCount} 剩余文案=${remainText}`)

// E. 悬浮主色
const primaryRef = await page.evaluate(() => {
  const d = document.createElement('div'); d.style.color = 'hsl(var(--p))'; d.style.position = 'absolute'; d.style.left = '-9999px'
  document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c
})
await page.hover('.wb-cell[data-id="todo"] .wb-todo__list li'); await page.waitForTimeout(200)
const hoverColor = await todoCard.locator('.wb-todo__list li .wb-todo__text').first().evaluate((el) => getComputedStyle(el).color)
ok('悬浮待办→文字主色', hoverColor === primaryRef, `hover=${hoverColor} primary=${primaryRef}`)

// 已完成弹窗
await todoCard.locator('button[aria-label="已完成"]').click()
await page.waitForSelector('.wb-pop--done', { timeout: 5000 })
const doneItems = await page.locator('.wb-pop--done .wb-todo__list li').count()
const doneHas = await page.locator('.wb-pop--done').getByText('买菜', { exact: false }).count()
ok('已完成弹窗展示已完成的待办(=1,含买菜)', doneItems === 1 && doneHas === 1, `items=${doneItems} 含买菜=${doneHas}`)
await page.locator('.wb-pop--done button[aria-label="关闭"]').click()
await page.waitForTimeout(200)

// A. 设置页分类管理
await page.locator('button[title="编辑工作台"]').click()
await page.waitForTimeout(300)
await page.locator('.wb-cell[data-id="todo"] button[aria-label="设置"]').click()
await page.waitForSelector('.wb-tsort', { timeout: 5000 })
await page.waitForTimeout(300)
const rowsBefore = await page.locator('.wb-tsort__row').count()
const hasDragHandle = await page.locator('.wb-tsort__row .wb-tsort__handle').count()
ok('分类管理列表渲染(4类)且含拖拽手柄', rowsBefore === 4 && hasDragHandle === rowsBefore, `rows=${rowsBefore} handles=${hasDragHandle}`)
const draggable = await page.locator('.wb-tsort__row').first().evaluate((el) => el.getAttribute('draggable'))
ok('分类行可拖拽(draggable=true)', draggable === 'true', `draggable=${draggable}`)

await step('分类添加生效', async () => {
  const inp = page.locator('input[placeholder="新分类名称"]')
  await inp.fill('测试分类')
  await inp.evaluate((el) => el.closest('.wb-row')?.querySelector('.btn')?.click())
  await page.waitForFunction(() => document.querySelectorAll('.wb-tsort__row').length === 5, { timeout: 5000 })
  const added = await page.locator('.wb-tsort__row', { hasText: '测试分类' }).count()
  if (added !== 1) throw new Error(`含测试分类=${added}`)
  ok('分类添加生效', true, 'rows=5')
})

await step('分类重命名生效', async () => {
  await page.locator('.wb-tsort__row', { hasText: '工作' }).getByRole('button', { name: '重命名' }).click()
  await page.waitForTimeout(150)
  await page.locator('.wb-tsort__row.is-editing .wb-tsort__edit').fill('工作X')
  await page.locator('.wb-tsort__row.is-editing button[aria-label="保存"]').click()
  await page.waitForFunction(() => document.querySelector('.wb-tsort__row .wb-tsort__name')?.textContent === '工作X', { timeout: 5000 })
    .catch(() => {})
  const renamed = await page.locator('.wb-tsort__row', { hasText: '工作X' }).count()
  if (renamed !== 1) throw new Error(`含工作X=${renamed}`)
  ok('分类重命名生效', true, '含工作X=1')
})

await step('分类删除生效', async () => {
  const delBtn = page.locator('.wb-tsort__row', { hasText: '临时' }).getByRole('button', { name: '删除' })
  if (await delBtn.count() === 0) throw new Error('未找到临时行的删除按钮')
  await delBtn.click()
  await page.waitForFunction(() => document.querySelectorAll('.wb-tsort__row').length === 4, { timeout: 5000 })
  const after = await page.locator('.wb-tsort__row', { hasText: '临时' }).count()
  if (after !== 0) throw new Error(`含临时=${after}`)
  ok('分类删除生效', true, 'rows=4')
})

ok('无控制台 error', errors.length === 0, errors.slice(0, 3).join(' || '))

await browser.close()
const fails = results.filter((r) => r.startsWith('FAIL'))
console.log('\n===== TODO 卡片验证结果 =====')
for (const r of results) console.log(r)
console.log(`\n通过 ${results.length - fails.length}/${results.length}`)
process.exit(fails.length ? 1 : 0)
