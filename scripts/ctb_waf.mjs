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
try {
  await page.goto('https://ctbpsp.com/#/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)

  // 用 GET 导航触发 API 的 WAF 挑战（浏览器会自动执行挑战脚本并重载）
  const apiGet = 'https://ctbpsp.com/cutominfoapi/searchkeyword?' + encodeURI(keyword.replace(/\s/g, ''))
  console.log('goto API(GET):', apiGet)
  const r1 = await page.goto(apiGet, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => ({ err: String(e) }))
  await page.waitForTimeout(5000)
  let ck = await ctx.cookies()
  console.log('cookies after GET-nav:', ck.map((c) => c.name).join(','))
  console.log('has acw_sc__v2:', ck.some((c) => c.name === 'acw_sc__v2'))
  const url1 = page.url()
  console.log('url now:', url1)

  // 现在尝试在页面内 POST
  const postRes = await page.evaluate(async (kw) => {
    const url = 'https://ctbpsp.com/cutominfoapi/searchkeyword?' + encodeURI(kw.replace(/\s/g, ''))
    const body = { uid: '0', PageSize: 10, CurrentPage: 1, searchType: 1, bulletinType: '' }
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body) })
      const t = await r.text()
      let j = null; try { j = JSON.parse(t) } catch (e) {}
      return { status: r.status, len: t.length, json: j, head: t.slice(0, 120) }
    } catch (e) { return { error: String(e) } }
  }, keyword)
  console.log('POST after GET-nav:', JSON.stringify(postRes).slice(0, 800))
} catch (e) {
  console.error('ERR:', e && e.message)
} finally {
  await browser.close()
}
