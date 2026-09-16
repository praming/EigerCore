# ctbpsp 按自定义关键词抓取（browser 搜索模式）

## 用户问题
> "ctbpsp 招标抓取的内容不是我自定义的关键词"

ctbpsp 是综合中招平台，首页只展示通用最新公告；按 `布带/吸丝带` 等关键词过滤首页必然 0 命中。
正确做法：**用关键词驱动 ctbpsp 的搜索框**，再抓取命中结果。

## 已落地改动
1. **`scripts/browser_fetch.js`**：新增关键词搜索模式。当 `keywords` 非空且配置了 `searchInputSelector` 时，
   逐关键词「填入搜索框 → 点击搜索按钮（或回车/按文本『搜索』兜底）→ 等结果渲染 → 抽 DOM」，多关键词结果合并后按「标题+日期」去重。
2. **`app/workbench_api.py`**：
   - `_fetch_browser_source` 把 `keywords` / `searchInputSelector` / `searchButtonSelector` 传入浏览器配置；
   - browser 源**始终按用户关键词二次过滤**（ctbpsp 搜索结果夹带「最新公告」噪声块，须过滤，保证卡片只显示真正命中）；
   - 修复 `_persist_bids` 批次内 `(link,title)` 重复插入导致的 `UNIQUE constraint failed`（新增 `seen_batch` 跳过同批重复）。
3. **前端**：
   - `web/src/api/workbench.ts`：`BiddingSource` 增 `searchInputSelector?` / `searchButtonSelector?` 并序列化传出；
   - `web/src/stores/workbench.ts`：`defaultPrefs` 的 ctbpsp 源加 `searchInputSelector:'input[type="text"]'` / `searchButtonSelector:'button.btns'`；
     **`normalizeState` 改为尊重用户自定义 keywords**（不再强制清空，仅以官方配方兜底 type/选择器）；`norm()` 去 `#hash`/`?query`/尾部斜杠，使 `https://ctbpsp.com/#/` 也能匹配官方配方；
     `addBiddingSource` / `updateBiddingSource` 支持这两个选择器；
   - `web/src/components/WbCardSettings.vue`：浏览器分支增加「搜索框选择器 / 搜索按钮选择器」输入与说明，并保留「填入 ctbpsp 预设」。
4. **数据清理**：删除了早期未过滤时入库的 `kw=[]` 陈旧噪声行（通用公告），卡片只读关键词命中。

## 验证（live，全绿）
- `GET /api/bidding?refresh=1&sources=[ctbpsp browser 源, keywords=['布带','吸丝带']]` → HTTP 200，返回命中词的真实标讯（如「芜湖卷烟材料有限责任公司布带采购（2026-2028年）项目招标公告」）。
- 非刷新读库 → ctbpsp 条目全部含 `布带/吸丝带`，**0 条不含关键词**。
- `vue-tsc --noEmit` 0 错；`vite build` 成功。

## 你需要做的
1. **硬刷新浏览器**（Ctrl/Cmd+Shift+R）拿到新 JS 包；
2. 「招标信息」卡片点一次**刷新**（真实起无头 Edge 驱动 ctbpsp 搜索，单源约 15–40s）；
3. 命中项点击跳转源站首页自行看详情（ctbpsp 详情页无链接，link 兜底为站点基址）；
4. **换关键词**：在设置面板编辑 ctbpsp 源的「关键词」即可（留空则展示最新公告）。

服务已在 `http://127.0.0.1:5000` 运行（PID 23028，最新代码）。
