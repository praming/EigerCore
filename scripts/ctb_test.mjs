import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const keyword = process.argv[2] || '布带'

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
})
const page = await ctx.newPage()

try {
  await page.goto('https://ctbpsp.com/#/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)

  const probe = await page.evaluate(async (kw) => {
    async function postSearch(searchType) {
      const url = 'https://ctbpsp.com/cutominfoapi/searchkeyword?' + encodeURI(kw.replace(/\s/g, ''))
      const body = { uid: '0', PageSize: 10, CurrentPage: 1, searchType, bulletinType: '' }
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          body: JSON.stringify(body),
        })
        const t = await r.text()
        let json = null
        try { json = JSON.parse(t) } catch (e) {}
        return { status: r.status, len: t.length, json }
      } catch (e) {
        return { error: String(e) }
      }
    }
    return { st0: await postSearch(0), st1: await postSearch(1) }
  }, keyword)

  for (const [k, v] of Object.entries(probe)) {
    console.log('\n===', k, '===')
    if (v.error) { console.log('  error:', v.error); continue }
    console.log('  status:', v.status, 'len:', v.len)
    if (v.json) {
      console.log('  json keys:', Object.keys(v.json))
      console.log('  raw:', JSON.stringify(v.json).slice(0, 600))
      for (const jk of Object.keys(v.json)) {
        const arr = v.json[jk]
        if (Array.isArray(arr)) {
          console.log(`  list field '${jk}': ${arr.length}`)
          if (arr.length) console.log('    sample:', JSON.stringify(arr[0]).slice(0, 500))
        }
      }
    }
  }
} catch (e) {
  console.error('TEST_ERROR:', e && e.message)
} finally {
  await browser.close()
}
