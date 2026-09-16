const { chromium } = require('C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const EXE = 'C:\\Users\\Praming\\.agent-browser\\browsers\\chrome-153.0.8010.36\\chrome.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage();
  await p.goto('http://localhost:5000', { waitUntil: 'load' });
  await p.waitForSelector('input[type=text]', { timeout: 15000 }).catch(() => {});
  await p.fill('input[type=text]', 'wbt');
  await p.fill('input[type=password]', 'wbt12345');
  await p.click('button[type=submit]');
  await p.waitForTimeout(3500);
  const btns = await p.$$('button');
  for (const btn of btns) {
    const t = (await btn.innerText()).trim();
    if (t === '工作台') { await btn.click(); break; }
  }
  await p.waitForTimeout(2500);
  const txt = await p.$eval('[data-iid="w11_worldclock"]', (el) => el.innerText).catch(() => '(not found)');
  console.log('=== worldclock rendered text ===');
  console.log(txt);
  await b.close();
})();
