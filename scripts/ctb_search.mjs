import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const keyword = process.argv[2] || '布带'

const browser = await chromium.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
})
const page = await ctx.newPage()

const apiResponses = []
page.on('response', async (resp) => {
  const u = resp.url()
  if (u.includes('searchkeyword')) {
    try {
      const buf = await resp.body()
      const txt = buf.toString('utf-8')
      let json = null
      try { json = JSON.parse(txt) } catch (e) {}
      apiResponses.push({ status: resp.status(), json, txt: txt.slice(0, 200) })
    } catch (e) {}
  }
})

try {
  await page.goto('https://ctbpsp.com/#/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(5000) // 等易盾被动令牌就绪

  const box = page.locator('input[type=text]').first()
  await box.click()
  await box.fill(keyword)
  await page.waitForTimeout(400)

  const sw = page.locator('.el-switch').first()
  const checkedBefore = await sw.locator('input.el-switch__input').isChecked().catch(() => null)
  console.log('switch checked before:', checkedBefore, '(true=搜标题, 需切到 搜全文)')
  if (checkedBefore) {
    await sw.click()
    await page.waitForTimeout(400)
  }

  // 等按钮可用（click 自带等待 enabled/visible）
  const btn = page.locator('button.btns').first()
  await btn.click({ timeout: 20000 })
  console.log('clicked search, waiting for API...')
  await page.waitForTimeout(8000)

  console.log('API responses captured:', apiResponses.length)
  for (const r of apiResponses) {
    console.log('  status', r.status, 'json?', !!r.json, 'txt:', r.txt)
  }
  // 取最后一个成功的 JSON
  const ok = apiResponses.filter((r) => r.json).pop()
  if (ok) {
    const j = ok.json
    console.log('JSON keys:', Object.keys(j))
    let list = null
    for (const k of Object.keys(j)) if (Array.isArray(j[k])) { list = j[k]; console.log('list field:', k, 'len', list.length); break }
    if (!list) {
      // 有时列表在 data 里
      if (j.data && Array.isArray(j.data)) list = j.data
      else if (j.data && j.data.list) list = j.data.list
    }
    console.log('LIST_LEN:', list ? list.length : 0)
    if (list) for (const it of list.slice(0, 8)) console.log('  ITEM:', JSON.stringify(it).slice(0, 400))
  } else {
    console.log('NO JSON RESPONSE')
  }
} catch (e) {
  console.error('ERR:', e && e.message)
} finally {
  await browser.close()
}
