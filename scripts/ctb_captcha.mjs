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
  const info = await page.evaluate(() => {
    const out = {}
    // 找验证码相关元素
    const cap = document.querySelector('.yidun, .necaptcha, .captcha, .slider, .verify, .nc_scale, [class*="captcha"], [class*="yidun"]')
    out.captchaEl = cap ? { cls: cap.className, html: cap.outerHTML.slice(0, 600) } : null
    // NECaptchaValidate
    const inp = document.querySelector('input[name=NECaptchaValidate]')
    out.necToken = inp ? inp.value : null
    // 是否有滑块
    out.sliders = [...document.querySelectorAll('[class*="slider"],[class*="scale"],[class*="yidun_slider"],[class*="nc_iconfont"]')].map((e) => e.className)
    // 搜索按钮 disabled?
    const btn = document.querySelector('button.btns')
    out.btnDisabled = btn ? btn.disabled : null
    // 搜索按钮外层是否含验证码
    return out
  })
  console.log(JSON.stringify(info, null, 1).slice(0, 2000))
} catch (e) {
  console.error('ERR:', e && e.message)
} finally {
  await browser.close()
}
