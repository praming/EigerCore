const { chromium } = require('C:/Users/Praming/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const EXE = 'C:\\Users\\Praming\\.agent-browser\\browsers\\chrome-153.0.8010.36\\chrome.exe';
const URL = 'http://localhost:5000';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleMsgs = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const out = {};
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
    // wait for username input
    await page.waitForSelector('input[type=text]', { timeout: 15000 }).catch(() => {});
    const hasUser = await page.$('input[type=text]');
    out.reachedLogin = !!hasUser;
    if (hasUser) {
      await page.fill('input[type=text]', 'wbt');
      await page.fill('input[type=password]', 'wbt12345');
      await page.click('button[type=submit]');
    }
    // wait for dashboard (sidebar / workbench button)
    await page.waitForTimeout(2500);
    out.localStorageBefore = await page.evaluate(() => localStorage.getItem('wb_state_v1'));

    // click 工作台 category
    const clicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role=button], .cat-item, .category'));
      const t = els.find((e) => (e.textContent || '').trim() === '工作台');
      if (t) { t.click(); return true; }
      return false;
    });
    out.clickedWorkbench = clicked;
    await page.waitForTimeout(2500);

    out.afterNav = await page.evaluate(() => {
      const grid = document.querySelector('.wb-grid');
      const cells = Array.from(document.querySelectorAll('.wb-cell'));
      return {
        hasGrid: !!grid,
        cellCount: cells.length,
        cells: cells.map((c) => ({
          iid: c.dataset.iid,
          childCount: c.children.length,
          textLen: (c.textContent || '').trim().length,
        })),
        bodyHasWorkbenchTitle: !!Array.from(document.querySelectorAll('h1')).find((h) => (h.textContent || '').includes('工作台')),
      };
    });

    // enter edit mode and try settings
    out.settingsTest = await page.evaluate(async () => {
      // find edit toggle (TopBar button with title containing 编辑)
      const editBtn = Array.from(document.querySelectorAll('button')).find((b) => /编辑/.test(b.getAttribute('title') || b.textContent || ''));
      if (!editBtn) return { editBtnFound: false };
      editBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const settingsBtn = document.querySelector('.wb-cell__btn[title="设置"], .wb-cell__bar button[title="设置"]');
      if (!settingsBtn) return { editBtnFound: true, settingsBtnFound: false };
      settingsBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      const modal = document.querySelector('.wb-pop__mask, .wb-pop');
      const title = modal ? (modal.textContent || '').includes('设置') : false;
      return { editBtnFound: true, settingsBtnFound: true, settingsModalOpen: !!modal, hasSettingsTitle: title };
    });

    out.localStorageAfter = await page.evaluate(() => localStorage.getItem('wb_state_v1'));
  } catch (e) {
    out.fatal = String(e);
  }
  out.consoleErrors = consoleMsgs;
  out.pageErrors = pageErrors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
