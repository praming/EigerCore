import { createRequire } from 'module'
const require = createRequire('C:/Users/Praming/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
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
  await page.waitForTimeout(3500)
  // 收集输入控件
  const inputs = await page.$$eval('input,textarea', (els) =>
    els.map((e) => ({ tag: e.tagName, type: e.type, placeholder: e.placeholder, name: e.name, id: e.id, cls: e.className.slice(0, 60), value: (e.value || '').slice(0, 40) })),
  )
  console.log('INPUTS:', JSON.stringify(inputs, null, 1).slice(0, 2000))
  // 收集含“搜索/全文/检索”的可点击文本
  const texts = await page.evaluate(() => {
    const res = []
    document.querySelectorAll('button,a,span,label,div').forEach((e) => {
      const t = (e.textContent || '').trim()
      if (t && (t.includes('搜索') || t.includes('全文') || t.includes('检索') || t.includes('布带')) && t.length < 30) {
        res.push({ tag: e.tagName, text: t, cls: (e.className || '').toString().slice(0, 50) })
      }
    })
    return [...new Set(res.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x)).slice(0, 40)
  })
  console.log('SEARCH_TEXTS:', JSON.stringify(texts, null, 1).slice(0, 2500))
} catch (e) {
  console.error('ERR:', e && e.message)
} finally {
  await browser.close()
}
