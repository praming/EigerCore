/**
 * browser_fetch.js — 无头/有头浏览器渲染+抽取辅助脚本
 *
 * 用途：对 WAF / SPA 强反爬站点（如 ctbpsp.com），后端 urllib 直抓无效，
 * 由本脚本驱动真实浏览器（playwright-core + 系统 Edge，stealth 模式绕过
 * navigator.webdriver 检测）加载页面、等 SPA 解密渲染、按 CSS 选择器抽取列表，
 * 输出统一结构的 JSON 数组给 Flask 后端并入招标管道。
 *
 * 调用方式（Flask 子进程）：
 *   node browser_fetch.js <config.json 路径>     # 推荐：配置文件传参，避免 stdin 转义/BOM 问题
 *   echo '<config json>' | node browser_fetch.js  # 兜底：stdin
 *
 * 配置(JSON)：
 *   warmupUrl           加载/过 WAF 的页面（即源首页）
 *   waitSelector        渲染完成的标志元素（等到它出现再抽），默认同 itemSelector
 *   waitTimeout         初始等待超时(ms)，默认 30000
 *   itemSelector        每个列表项的容器选择器（如 'div.left_body'）
 *   titleSelector       项内标题选择器
 *   linkSelector        项内链接选择器（可选；缺省用 baseUrl）
 *   summarySelector     项内摘要选择器（可选；多元素用 · 连接）
 *   dateRegex           从项文本提取日期的正则（含捕获组），可选
 *   baseUrl             链接兜底 / 相对链接补全用的站点基址
 *   maxItems            最多返回条数，默认 30
 *   stealth             是否隐藏 navigator.webdriver，默认 true
 *   channel             浏览器通道，默认 msedge（系统 Edge）
 *   keywords            关键词数组（可选）：配置后逐关键词驱动站点搜索框提交，
 *                       抓取各关键词的结果列表并合并去重；为空则直接抓 warmupUrl 首页。
 *   searchInputSelector 关键词搜索的输入框选择器（如 'input[type="text"]'）；
 *                       仅当 keywords 非空且本字段非空时启用搜索模式。
 *   searchButtonSelector 提交搜索的按钮选择器（如 'button.btns'）；留空则在搜索框回车，
 *                       或按按钮文本「搜索」兜底点击。
 *   searchSettleMs      提交搜索后等待结果渲染的稳定等待(ms)，默认 8000
 *   searchFullTextToggleSelector 全文/标题搜索切换开关（如 Element UI 的 '.el-switch.switchStyle'）；
 *                       配置后会在关键词搜索开始前确保开关处于「OFF/全文」模式：
 *                       检测 aria-checked="true" 则点击一次并等待开关重渲。仅在 searchMode 启用时生效。
 *   searchInvoke        搜索触发方式：'dom' = 模拟输入+点按钮（通用）；'vue' = 直接调用页面 Vue 组件方法。
 *                       ctbpsp 在 DOM click 时会拉起易盾滑块验证并禁用按钮，必须走 vue 直调。
 *   vueMethod            searchInvoke='vue' 时调用的组件方法名（默认 'getlist'）
 *   vueValueField       组件里承载搜索关键词的 data 字段名（默认 'inpvalue'）
 *   vueTypeField        组件里承载搜索类型(标题/全文)的 data 字段名（默认 'searchType'）
 *   vueDisableField     组件里按钮禁用位的 data 字段名（默认 'ButtonGrayingBoolen'）
 *   searchGapMs         多关键词之间的间隔(ms)，默认 2000
 *   userDataDir         持久化浏览器 profile 目录（保留 cookie，降低风控命中）
 *   headful             是否使用有头模式（默认 true；ctbpsp 对无头指纹敏感）
 *
 * 输出：仅向 stdout 打印 JSON 数组（即使为空/出错也输出 [] 或 {error}）。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

(async () => {
  let cfg;
  let cfgPath = '';
  try {
    let raw = '';
    const argPath = process.argv[2];
    if (argPath) {
      cfgPath = argPath;
      raw = fs.readFileSync(argPath, 'utf-8');
    } else {
      raw = await readStdin();
    }
    cfg = JSON.parse(raw || '{}');
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: 'bad config: ' + e.message }));
    return;
  }

  const warmupUrl = (cfg.warmupUrl || '').trim();
  if (!warmupUrl) {
    process.stdout.write(JSON.stringify({ error: 'warmupUrl required' }));
    return;
  }

  const keywords = Array.isArray(cfg.keywords)
    ? cfg.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const searchInputSelector = (cfg.searchInputSelector || '').trim();
  const searchButtonSelector = (cfg.searchButtonSelector || '').trim();
  const searchSettleMs = Number(cfg.searchSettleMs) || 8000;
  const searchFullTextToggleSelector = (cfg.searchFullTextToggleSelector || '').trim();
  const searchInvoke = (cfg.searchInvoke || 'dom').trim();
  const vueMethod = (cfg.vueMethod || 'getlist').trim();
  const vueValueField = (cfg.vueValueField || 'inpvalue').trim();
  const vueTypeField = (cfg.vueTypeField || 'searchType').trim();
  const vueDisableField = (cfg.vueDisableField || 'ButtonGrayingBoolen').trim();
  const userDataDir = (cfg.userDataDir || '').trim();
  const headful = cfg.headful === true;
  const waitSelector = cfg.waitSelector || cfg.itemSelector || 'body';
  const waitTimeout = Number(cfg.waitTimeout) || 30000;
  const itemSelector = cfg.itemSelector || '';
  const titleSelector = cfg.titleSelector || '';
  const linkSelector = cfg.linkSelector || '';
  const summarySelector = cfg.summarySelector || '';
  const dateRegexSrc = cfg.dateRegex || '';
  const baseUrl = (cfg.baseUrl || warmupUrl).trim();
  const maxItems = Number(cfg.maxItems) || 30;
  const stealth = cfg.stealth !== false;
  const channel = cfg.channel || 'msedge';
  const searchGapMs = Number(cfg.searchGapMs) || 2000;
  // 启用搜索模式的条件：有关键词且指定了搜索输入框选择器
  const searchMode = keywords.length > 0 && !!searchInputSelector;

  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-infobars'];
  if (stealth) args.push('--disable-blink-features=AutomationControlled');
  const launchOpts = { headless: !headful, channel, args };
  if (userDataDir) launchOpts.viewport = { width: 1280, height: 900 };

  let browser = null;
  let ctx = null;

  try {
    if (userDataDir) {
      ctx = await chromium.launchPersistentContext(userDataDir, launchOpts);
      var page = ctx.pages()[0] || (await ctx.newPage());
    } else {
      browser = await chromium.launch(launchOpts);
      var page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    }
    // 额外隐藏自动化特征（与 --disable-blink-features=AutomationControlled 双保险）
    await page.addInitScript(() => {
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
    });

    // 抽取当前页面已渲染的 itemSelector 列表：轮询等到出现，再稳定等待后抽 DOM。
    async function scrapeCurrentPage() {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        const n = await page.$$eval(itemSelector, (ns) => ns.length).catch(() => 0);
        if (n > 0) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(1500);
      return page
        .$$eval(
          itemSelector,
          (nodes, opts) => {
            const out = [];
            for (const node of nodes) {
              const pick = (sel) => {
                const el = node.querySelector(sel);
                return el ? (el.textContent || '').trim() : '';
              };
              const title = pick(opts.titleSelector);
              if (!title) continue;
              let url = opts.baseUrl;
              const aIn = node.querySelector('a');
              const aAnc = node.closest ? node.closest('a') : null;
              const aSel = opts.linkSelector ? node.querySelector(opts.linkSelector) : null;
              const cand = aSel || aIn || aAnc;
              if (cand && cand.getAttribute && cand.getAttribute('href')) {
                let h = cand.getAttribute('href');
                if (h.startsWith('/')) h = opts.baseUrl.replace(/\/$/, '') + h;
                url = h;
              }
              let summary = '';
              if (opts.summarySelector) {
                const els = node.querySelectorAll(opts.summarySelector);
                const parts = [];
                for (const el of els) {
                  const t = (el.textContent || '').trim();
                  if (t) parts.push(t);
                }
                summary = parts.join(' · ');
              }
              const text = node.innerText || '';
              let publishedAt = '';
              if (opts.dateRegex) {
                try {
                  const m = text.match(new RegExp(opts.dateRegex));
                  if (m) publishedAt = m[1] || m[0];
                } catch (e) {}
              }
              out.push({ title, url, publishedAt, summary, body: '', keywords: [] });
              if (out.length >= opts.maxItems) break;
            }
            return out;
          },
          { titleSelector, linkSelector, summarySelector, baseUrl, dateRegex: dateRegexSrc, maxItems }
        )
        .catch(() => []);
    }

    // vue 直调搜索：绕开 DOM click 触发的人机验证（ctbpsp 的 searchkeyword 接口
    // 由组件方法发起；点按钮会先拉起易盾滑块并 disable 按钮，导致搜索请求不发）。
    async function searchKeywordVue(kw) {
      const ok = await page
        .evaluate(
          (o) => {
            const findVm = (sel) => {
              let el = sel ? document.querySelector(sel) : null;
              while (el) {
                if (el.__vue__) return el.__vue__;
                el = el.parentElement;
              }
              return null;
            };
            const input = document.querySelector(o.inputSel);
            if (!input) return 'no-input';
            const vm = findVm(o.inputSel) || findVm(o.btnSel);
            if (!vm) return 'no-vm';
            if (typeof vm[o.method] !== 'function') return 'no-method';
            // 关键：通过 input 元素派发 input 事件来更新 v-model 绑定的值，
            // 而不是猜测字段名（ctbpsp 的搜索框 v-model 字段并非 inpvalue，直接赋字段名无效，
            // 空关键词搜索会被风控判定为异常并弹「请完成安全验证」滑块）。
            try {
              const desc = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              );
              desc.set.call(input, o.kw);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {
              // 兜底：直接设已知字段名
              if (o.valueField && o.valueField in vm) vm[o.valueField] = o.kw;
            }
            // fullText=true 时把搜索类型置为「全文」：组件里 searchType=false 表示全文
            if (o.typeField) vm[o.typeField] = o.fullText ? false : true;
            if (o.disableField && o.disableField in vm) vm[o.disableField] = false;
            try {
              vm[o.method]();
              return 'ok';
            } catch (e) {
              return 'err ' + e.message;
            }
          },
          {
            btnSel: searchButtonSelector,
            inputSel: searchInputSelector,
            kw,
            method: vueMethod,
            valueField: vueValueField,
            typeField: vueTypeField,
            disableField: vueDisableField,
            fullText: true,
          }
        )
        .catch((e) => 'evaluate-failed ' + e.message);
      if (ok !== 'ok') return { error: ok, items: [] };
      await page.waitForTimeout(searchSettleMs);
      // 若落到了挑战页（弹「请完成安全验证」），说明本次搜索被风控拦截；
      // 不再强制抽 DOM（抽不到），让调用方按 0 结果处理，下次再用已沉淀的 cookie 重试。
      if (await isChallenge()) return { error: 'challenge', items: [] };
      return { items: await scrapeCurrentPage() };
    }

    // 关键词搜索（dom 模式）：聚焦搜索框 → 真实键盘输入 → 点搜索按钮
    async function searchKeyword(kw) {
      if (searchInvoke === 'vue') return searchKeywordVue(kw);
      const box = await page.$(searchInputSelector);
      if (!box) return [];
      await box.focus().catch(() => {});
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await page.keyboard.type(kw, { delay: 30 }).catch(() => {});
      await page.waitForTimeout(300);
      let clicked = false;
      const btns = await page.$$(searchButtonSelector || 'button');
      for (const b of btns) {
        const t = (await b.innerText().catch(() => '')) || '';
        const matchSel =
          searchButtonSelector &&
          (await b.evaluate((n) => n.matches(searchButtonSelector)).catch(() => false));
        if (matchSel || (!searchButtonSelector && t.includes('搜索'))) {
          await b
            .click({ force: true, timeout: 5000 })
            .catch(async () => {
              await b.evaluate((n) => n.click());
            });
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        await page.keyboard.press('Enter').catch(() => {});
      }
      await page.waitForTimeout(searchSettleMs);
      return scrapeCurrentPage();
    }

    // 确保搜索开关处于「全文」模式：检测 aria-checked="true"（搜标题 ON）则点击一次。
    async function ensureFullTextMode() {
      if (!searchFullTextToggleSelector) return false;
      const sel = searchFullTextToggleSelector;
      let toggled = false;
      try {
        toggled = await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return false;
          const aria = el.getAttribute && el.getAttribute('aria-checked');
          if (aria === 'true') {
            el.click();
            return true;
          }
          return false;
        }, sel);
      } catch (e) {}
      if (toggled) {
        await page.waitForTimeout(600);
      }
      return toggled;
    }

    // 判断是否落在 WAF / 反爬挑战页
    async function isChallenge() {
      return page
        .evaluate(() => {
          const t =
            ((document.body && document.body.innerText) || '') + ' ' + document.title;
          const low = t.toLowerCase();
          if (
            low.includes('acw_sc') ||
            low.includes('安全验证') ||
            low.includes('人机验证') ||
            low.includes('waf') ||
            low.includes('access denied') ||
            low.includes('just a moment') ||
            low.includes('verify you are human') ||
            low.includes('cadelivery')
          )
            return true;
          if (document.querySelector('[class*="acw_sc"], [id*="acw_sc"]')) return true;
          return false;
        })
        .catch(() => false);
    }

    // 初始加载 + 过 WAF：最多 4 次导航，命中挑战页则等 cookie 落地后重载。
    const MAX_ATTEMPTS = 4;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await page.goto(warmupUrl, { waitUntil: 'load', timeout: 30000 });
      } catch (e) {}
      await page.waitForTimeout(2500);
      try {
        await page.waitForSelector(waitSelector, { timeout: waitTimeout });
      } catch (e) {}
      if (!(await isChallenge())) break;
      if (attempt < MAX_ATTEMPTS - 1) await page.waitForTimeout(2500);
    }

    // 抽取：搜索模式逐关键词合并，否则抓首页
    let items = [];
    let searchError = '';
    if (searchMode) {
      if (searchInvoke !== 'vue') await ensureFullTextMode();
      for (let i = 0; i < keywords.length; i++) {
        const found = await searchKeyword(keywords[i]);
        if (found && Array.isArray(found.items)) {
          items.push(...found.items);
          if (found.error) searchError = found.error;
        } else {
          items.push(...(found || []));
        }
        if (items.length >= maxItems) break;
        if (i < keywords.length - 1) await page.waitForTimeout(searchGapMs);
      }
    } else if (itemSelector) {
      items = await scrapeCurrentPage();
    }

    // 去重（标题+日期），并按 maxItems 截断
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const k = ((it.title || '') + '|' + (it.publishedAt || '')).trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
      if (out.length >= maxItems) break;
    }

    if (!out.length && searchError) {
      process.stdout.write(JSON.stringify({ error: 'search failed: ' + searchError }));
    } else {
      process.stdout.write(JSON.stringify(out));
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  } finally {
    try {
      if (ctx) await ctx.close();
      else if (browser) await browser.close();
    } catch (e) {}
    try {
      if (cfgPath) fs.unlinkSync(cfgPath);
    } catch (e) {}
  }
})();
