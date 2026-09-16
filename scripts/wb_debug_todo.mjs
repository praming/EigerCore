import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw
const BASE = 'http://127.0.0.1:5000'
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const pg = await ctx.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await pg.request.post(`${BASE}/api/login`, { headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ username: 'wb_probe_sys', password: 'probe1234', remember: true }) })
await pg.goto(BASE + '/', { waitUntil: 'networkidle' })
await pg.getByText('工作台', { exact: true }).first().click()
await pg.waitForSelector('.wb-grid')
await sleep(400)
const html = await pg.locator('.wb-cell[data-id="todo"] .wb-card__right').evaluate((el) => el.outerHTML)
console.log(html)
await browser.close()
