import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const keyword = process.argv[2] || '布带'
const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' })
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
page.on('pageerror', (e) => errs.push('PAGEERR:' + e.message.slice(0, 120)))
try {
  await page.goto('https://ctbpsp.com/#/', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(5000)
  const apiGet = 'https://ctbpsp.com/cutominfoapi/searchkeyword?' + encodeURI(keyword.replace(/\s/g, ''))
  await page.goto(apiGet, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(8000)
  const dc = await page.evaluate(() => document.cookie)
  console.log('document.cookie:', dc.slice(0, 300))
  console.log('has acw_sc__v2:', dc.includes('acw_sc__v2'))
  console.log('console errors:', JSON.stringify(errs.slice(0, 8)))
} catch (e) { console.error('ERR:', e && e.message) } finally { await browser.close() }
