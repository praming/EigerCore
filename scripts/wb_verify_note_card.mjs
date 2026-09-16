import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = 'http://127.0.0.1:5000'
const USER = 'wb_probe_sys'
const PASS = 'probe1234'
const results = []
const ok = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`)

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const api = ctx.request

try {
  // 登录 + 写入种子（带 CSRF）
  const csrf = await (await api.get(BASE + '/api/csrf-token')).json()
  const loginR = await api.post(BASE + '/api/login', { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token }, data: { username: USER, password: PASS, remember: true } })
  ok('登录成功', loginR.ok() && loginR.status() === 200, `status=${loginR.status()}`)

  const now = Date.now()
  const seed = { prefs: { note: { items: [
    { id: 901, title: '导轨式液压升降平台采购合同关键条款核对清单', body: '1. 技术参数\n2. 验收标准\n3. 付款节点', updatedAt: now - 3600_000 },
    { id: 902, title: '短标题', body: '正文', updatedAt: now - 7200_000 },
  ] } } }
  const putR = await api.put(BASE + '/api/workbench/state', { headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token }, data: { state: seed } })
  ok('种子状态写入成功(PUT 200)', putR.status() === 200, `status=${putR.status()}`)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const noteCard = page.locator('.wb-card', { hasText: '记事本' }).first()
  await noteCard.waitFor({ state: 'visible', timeout: 8000 })

  // 列表项结构
  const items = noteCard.locator('.wb-note__item')
  const cnt = await items.count()
  ok('列表含至少 2 条记事', cnt >= 2, `count=${cnt}`)

  const first = items.first()
  const hasTitle = await first.locator('.wb-note__title').count()
  const hasDots = await first.locator('.wb-note__dots').count()
  const hasDate = await first.locator('.wb-note__date').count()
  ok('每项含 标题/点线/日期 三元素', hasTitle === 1 && hasDots === 1 && hasDate === 1, `t=${hasTitle} d=${hasDots} dt=${hasDate}`)

  // 无边框
  const borderW = await first.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))
  ok('单条记事无边框', borderW === 0, `borderTopWidth=${borderW}`)

  // 几何顺序 + 点线自动撑满：取标题较短的项验证，长标题项仅确认点线存在即可
  const geos = await noteCard.locator('.wb-note__item').evaluateAll((els) => els.map((el) => {
    const t = el.querySelector('.wb-note__title').getBoundingClientRect()
    const dots = el.querySelector('.wb-note__dots').getBoundingClientRect()
    const dt = el.querySelector('.wb-note__date').getBoundingClientRect()
    const win = el.getBoundingClientRect().width
    return { title: el.querySelector('.wb-note__title').textContent, tR: t.right, dotsL: dots.left, dotsR: dots.right, dtL: dt.left, win }
  }))
  // 顺序校验（取首项）
  const g0 = geos[0]
  ok('标题在点线左侧', g0.tR <= g0.dotsL + 1, `title.right=${g0.tR.toFixed(0)} dots.left=${g0.dotsL.toFixed(0)}`)
  ok('点线在日期左侧', g0.dotsR <= g0.dtL + 1, `dots.right=${g0.dotsR.toFixed(0)} date.left=${g0.dtL.toFixed(0)}`)
  // 自动撑满：标题较短的项点线应占宽 > 30%
  const shortGeo = geos.slice().sort((a, b) => a.title.length - b.title.length)[0]
  ok('点线自动撑满(短标题项占宽>30%)', (shortGeo.dotsR - shortGeo.dotsL) / shortGeo.win > 0.3, `短标题="${shortGeo.title}" dots-width=${(100*(shortGeo.dotsR-shortGeo.dotsL)/shortGeo.win).toFixed(0)}%`)
  // 长标题项点线存在（>0）
  const longGeo = geos.slice().sort((a, b) => b.title.length - a.title.length)[0]
  ok('长标题项点线仍存在(>0)', (longGeo.dotsR - longGeo.dotsL) > 0, `长标题="${longGeo.title}" dots-width=${(longGeo.dotsR-longGeo.dotsL).toFixed(0)}px`)

  // 悬浮标题转主色（对比卡片图标主色）
  const iconColor = await noteCard.locator('.wb-card__icon').evaluate((el) => getComputedStyle(el).color)
  const beforeColor = await first.locator('.wb-note__title').evaluate((el) => getComputedStyle(el).color)
  await first.hover()
  await page.waitForTimeout(250)
  const afterColor = await first.locator('.wb-note__title').evaluate((el) => getComputedStyle(el).color)
  ok('悬浮前标题非主色', beforeColor !== iconColor, `before=${beforeColor}`)
  ok('悬浮后标题转主色', afterColor === iconColor, `after=${afterColor} primary=${iconColor}`)

  // 点击打开详情弹窗
  await first.click()
  await page.waitForTimeout(300)
  const pop = page.locator('.wb-pop--note')
  ok('点击打开记事详情弹窗', await pop.isVisible())

  // 右上角 编辑/删除/关闭 三图标
  const headBtns = pop.locator('.wb-pop__head .wb-card__right .wb-cell__btn')
  const bCount = await headBtns.count()
  ok('详情头部含 3 个图标按钮', bCount === 3, `count=${bCount}`)
  const labels = await headBtns.evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || '') + '|' + (e.querySelector('svg')?.getAttribute('class') || '')))
  ok('含 编辑/删除/关闭', labels.some(l => /编辑/.test(l)) && labels.some(l => /删除/.test(l)) && labels.some(l => /关闭/.test(l)), labels.join(' ; '))

  // 编辑：进入编辑态并保存
  await pop.locator('button[aria-label="编辑"]').click()
  await page.waitForTimeout(200)
  const editTitleInput = pop.locator('input.wb-input')
  const editBody = pop.locator('textarea.wb-input')
  ok('进入编辑态(出现输入框)', await editTitleInput.isVisible() && await editBody.isVisible())
  await editTitleInput.fill('导轨升降平台合同核对（修订）')
  await pop.locator('.wb-pop__foot button', { hasText: '保存' }).click()
  await page.waitForTimeout(300)
  const titles = await items.locator('.wb-note__title').allInnerTexts()
  ok('保存后列表标题更新', titles.includes('导轨升降平台合同核对（修订）'), titles.join(' / '))

  // 保存后详情弹窗仍打开，直接删除当前记事
  await page.locator('.wb-pop--note button[aria-label="删除"]').click()
  await page.waitForTimeout(400)
  const cnt2 = await items.count()
  ok('删除后剩 1 条', cnt2 === 1, `count=${cnt2}`)

  // 截图留存
  await page.locator('.wb-card', { hasText: '记事本' }).first().screenshot({ path: 'D:/wwwroot/workbuddy/python-nav/scripts/_note_list.png' }).catch(() => {})
} catch (e) {
  results.push('FAIL | 脚本异常 | ' + e.message)
} finally {
  await browser.close()
}

console.log('\n==== 记事本卡片验证 ====')
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
