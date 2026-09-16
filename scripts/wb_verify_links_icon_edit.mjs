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
    const csrf = await (await api.get(BASE + 'api/csrf-token')).json()
    const loginRes = await api.post(BASE + 'api/login', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: { username: USER, password: PASS, remember: true },
    })
    ok('登录成功', loginRes.ok() && loginRes.status() === 200, `status=${loginRes.status()}`)

    // 种子：两只链接（一只纯 Lucide、一只带图片图标）
    const seed = {
      state: {
        prefs: {
          links: {
            items: [
              { id: 9101, title: 'GitHub', url: 'https://github.com', icon: 'github' },
              { id: 9102, title: '图来图', url: 'https://example.com', icon: 'link', iconImg: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
            ],
          },
        },
      },
    }
    const putRes = await api.put(BASE + 'api/workbench/state', {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf.token },
      data: seed,
    })
    ok('种子写入成功', putRes.ok() && putRes.status() === 200, `status=${putRes.status()}`)

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // 打开常用链接设置页
    const editBtn = page.locator('button[aria-label="编辑工作台"], button[aria-label="退出编辑"]')
    await editBtn.first().click()
    await page.waitForTimeout(400)
    const gear = page.locator('.wb-cell', { hasText: '常用链接' }).first().locator('.wb-cell__btn[aria-label="设置"]')
    await gear.click()
    await page.waitForTimeout(500)

    // 列表单行渲染
    const rows = page.locator('.wb-pop__body').locator('.wb-lk__row')
    const rc = await rows.count()
    ok('已添加链接列表渲染', rc === 2, `rows=${rc}`)
    const firstRow = rows.first()
    ok('行内含图标槽', (await firstRow.locator('.wb-lk__ic').count()) === 1)
    ok('行内含标题', (await firstRow.locator('.wb-lk__title').count()) === 1)
    ok('行内含网址', (await firstRow.locator('.wb-lk__url').count()) === 1)
    ok('行内含编辑按钮', (await firstRow.locator('button[aria-label="编辑"]').count()) === 1)
    ok('行内含删除按钮', (await firstRow.locator('button[aria-label="删除"]').count()) === 1)
    const wrap = await firstRow.evaluate((el) => getComputedStyle(el).flexWrap)
    ok('单行不换行(flex-wrap=nowrap)', wrap === 'nowrap', `flexWrap=${wrap}`)
    // 带图片图标的行渲染 <img>
    const imgRow = page.locator('.wb-pop__body').locator('.wb-lk__row', { hasText: '图来图' })
    ok('图片图标行渲染 img', (await imgRow.locator('img.wb-lk__img').count()) === 1)

    // —— 编辑测试 ——
    await firstRow.locator('button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)
    const titleVal = await page.locator('input[placeholder="名称（如 GitHub）"]').inputValue()
    const urlVal = await page.locator('input[placeholder="网址 URL"]').inputValue()
    ok('编辑时名称预填', titleVal === 'GitHub', `title=${titleVal}`)
    ok('编辑时网址预填', urlVal === 'https://github.com', `url=${urlVal}`)
    const saveCnt = await page.locator('.wb-pop__body').getByRole('button', { name: '保存修改' }).count()
    ok('按钮变为「保存修改」', saveCnt === 1, `count=${saveCnt}`)
    const capTxt = await page.locator('.wb-pop__body').innerText()
    ok('显示正在编辑提示', capTxt.includes('正在编辑') && capTxt.includes('GitHub'))

    // 改名 + 加图标链接，保存
    await page.locator('input[placeholder="名称（如 GitHub）"]').fill('GitLab')
    await page.locator('input[placeholder="图标链接（图片 URL，可选）"]').fill('https://x.test/ico.png')
    await page.waitForTimeout(150)
    await page.locator('.wb-pop__body').getByRole('button', { name: '保存修改' }).click()
    await page.waitForTimeout(700)

    const bodyTxt = await page.locator('.wb-pop__body').innerText()
    ok('保存后列表显示新名称', bodyTxt.includes('GitLab'), bodyTxt.includes('GitLab') ? '含GitLab' : '无')
    const addCnt = await page.locator('.wb-pop__body').getByRole('button', { name: '添加链接' }).count()
    ok('保存后按钮回到「添加链接」', addCnt === 1, `count=${addCnt}`)

    await page.waitForTimeout(1600)
    const st = await api.get(BASE + 'api/workbench/state')
    const sb = await st.json()
    const items = (sb.state && sb.state.prefs && sb.state.prefs.links && sb.state.prefs.links.items) || []
    const edited = items.find((x) => x.id === 9101)
    ok('服务端名称更新', edited && edited.title === 'GitLab', edited ? `title=${edited.title}` : 'no')
    ok('服务端图标链接写入 iconImg', edited && edited.iconImg === 'https://x.test/ico.png', edited ? `iconImg=${edited.iconImg}` : 'no')
    ok('图片图标链接仍保留', items.find((x) => x.id === 9102)?.iconImg?.startsWith('data:'), 'data url 保留')

    // —— 取消测试 ——
    const r1 = page.locator('.wb-pop__body').locator('.wb-lk__row', { hasText: 'GitLab' })
    await r1.locator('button[aria-label="编辑"]').click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="名称（如 GitHub）"]').fill('应被丢弃')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: '取消' }).click()
    await page.waitForTimeout(400)
    const titleAfter = await page.locator('input[placeholder="名称（如 GitHub）"]').inputValue()
    ok('取消后表单清空', titleAfter === '', `title=${titleAfter}`)
    const stillThere = await page.locator('.wb-pop__body').locator('.wb-lk__row', { hasText: 'GitLab' }).count()
    ok('取消不影响原链接', stillThere === 1, `rows=${stillThere}`)

    // —— 新增带图标链接 ——
    await page.locator('input[placeholder="名称（如 GitHub）"]').fill('新站')
    await page.locator('input[placeholder="网址 URL"]').fill('https://news.test')
    await page.locator('input[placeholder="图标链接（图片 URL，可选）"]').fill('https://news.test/n.png')
    await page.waitForTimeout(150)
    await page.locator('.wb-pop__body').getByRole('button', { name: '添加链接' }).click()
    await page.waitForTimeout(1600)
    const st2 = await api.get(BASE + 'api/workbench/state')
    const sb2 = await st2.json()
    const items2 = (sb2.state && sb2.state.prefs && sb2.state.prefs.links && sb2.state.prefs.links.items) || []
    const added = items2.find((x) => x.url === 'https://news.test')
    ok('新增链接落库', !!added, added ? `title=${added.title}` : '无')
    ok('新增链接带图标链接', added && added.iconImg === 'https://news.test/n.png', added ? `iconImg=${added.iconImg}` : '无')

    console.log('\n' + results.join('\n'))
    const fails = results.filter((r) => r.startsWith('FAIL'))
    console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`)
    process.exit(fails.length ? 1 : 0)
  } catch (e) {
    console.error('SCRIPT ERROR', e)
    process.exit(2)
  } finally {
    await browser.close()
  }
}
run()
