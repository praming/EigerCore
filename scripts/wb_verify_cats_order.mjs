// 验证顶栏分类顺序：工作台在前、导航在后（纯前端顺序互换）
import pw from 'file:///C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:5000'
const node = 'C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core'

async function main() {
  const ctx = await chromium.launch({
    executablePath: undefined,
    channel: 'msedge',
    headless: true,
  }).catch(async () => chromium.launch({ channel: 'msedge', headless: true }))
  const browser = ctx
  const pg = await browser.newPage()

  const errors = []
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // 登录握手（/api/login 免 CSRF），先登录再加载页面，避免未登录首屏预请求 401
  await pg.request.post(`${BASE}/api/login`, {
    headers: { 'Content-Type': 'application/json', '_wants_json': '1' },
    data: { username: 'wb_probe_sys', password: 'probe1234' },
  })
  await pg.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await pg.waitForSelector('.cat-switch .cat-btn', { timeout: 10000 })

  const order = await pg.$$eval('.cat-switch .cat-btn', (els) =>
    els.map((e) => (e.getAttribute('title') || e.textContent || '').trim())
  )

  const pass = order[0] === '工作台' && order[1] === '导航'
  console.log('顶栏分类顺序:', JSON.stringify(order))
  console.log('cat-order:', pass ? 'PASS' : 'FAIL')
  console.log('no-console-errors:', errors.length === 0 ? 'PASS' : 'FAIL')
  if (errors.length) console.log('  errors:', errors.slice(0, 5))

  await browser.close()
  const ok = pass && errors.length === 0
  console.log('汇总:', ok ? '1/1 通过' : '存在失败')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('脚本异常:', e); process.exit(2) })
