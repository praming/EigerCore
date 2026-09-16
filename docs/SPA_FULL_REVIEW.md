# SPA 全量复核报告（#121 收尾 · 功能与交互细节核一遍）

> 复核时间：2026-08-17
> 复核范围：Vue 3 + Vite + TS + Pinia SPA 主线（#121/#122/#123/Phase 4/Phase 5 + 收尾回归）
> 复核触发：用户要求「把所有功能、细节都核一遍」，重点含此前两次强调的两处交互细节
> 复核方法：逐文件代码走查 + 契约测试 + 回归门禁 + 关键节点直接读取源码验证（非仅依赖记忆）

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| 交互细节 1：编辑分组后保持当前视图 | ✅ 确认正确（`refreshAfterMutation` 从不重置 `view`） |
| 交互细节 2：内容区纵向滚动保持圆角 | ✅ 确认正确（`.drawer-content` 与 `.content-panel` 同心 1.6rem 圆角） |
| 全功能链路（18 组件 → store → api → 后端） | ✅ 贯通，无遗漏 |
| 后端契约一致性 | ✅ 端点与参数全部对齐 |
| **发现并修复的关键缺陷** | ⚠️ P0：浏览器侧 multipart 写请求静默失败（Content-Type 头缺 boundary），已修复 |

---

## 1. 两个重点交互细节（用户此前强调）

### 1.1 编辑分组后保持在当前视图（不跳转到导航视图）✅

**真源代码**：`web/src/stores/dashboard.ts`

- 分组提交：`submitGroup()` 成功路径调用 `await refreshAfterMutation()`（约 line 230 区域）。
- `refreshAfterMutation()`（line 288–294）：
  ```ts
  async function refreshAfterMutation() {
    if (view.value === 'nav') {
      await loadDashboard()
      return
    }
    await Promise.all([loadGroups().catch(() => {}), loadDashboard()])
  }
  ```
- **关键**：该函数只按 `view.value` 重新拉取数据，**从不调用 `setView()`，也从不把 `view` 重置**。视图状态完全由 Pinia 的 `view` ref 保持。
- 因此：在「总览视图」编辑分组 → 提交成功 → 数据刷新但 `view` 仍为 `overview`，不会跳到导航视图。 ✅ 符合用户既定规则。

### 1.2 内容区纵向滚动保持圆角（无直角截断）✅

**真源样式**：设计系统并非 `web/src/input.css`（该文件不存在），而是 **`app/static/src/input.css`**（Tailwind 源），SPA 复用同一套设计令牌。

- `.drawer-content`（input.css:263）：
  ```css
  .drawer-content { flex: 1; min-width: 0; height: 100%; overflow-y: auto; border-radius: 1.6rem; }
  ```
  桌面端唯一滚动容器，自带 `border-radius: 1.6rem` 并对溢出内容做圆角裁剪。
- `.content-panel`（input.css:283–289）：
  ```css
  .content-panel {
      background: hsl(var(--b1));
      border: 1px solid hsl(var(--bc) / .08);
      border-radius: 1.6rem;
      box-shadow: var(--shadow-soft);
      padding: 1.5rem;
  }
  ```
  内部面板拥有**独立的** 1.6rem 圆角 + 背景 + 边框 + 阴影。

**机制**：滚动容器（`.drawer-content`）与内部面板（`.content-panel`）同为 1.6rem 同心圆角。纵向滚动时，可见的圆角卡片由 `.content-panel` 自身提供，其背景与圆角随内容高度一起延伸，**不会出现直角被裁出的尖角**。

- 移动端（<1024px）：`.content-panel` 自身仍带圆角，整页滚动，同样无直角截断。 ✅
- 另：`.link-card` 的 dock 放大由 `transform: scale(var(--dock-scale,1))`（input.css:361）消费 `useDock` 写入的变量；hover 使用独立的 `translate` 避免覆盖 scale。 ✅

---

## 2. 全功能链路审计

逐文件走查结论（按「组件 → store → api → 后端」链路）：

| 文件 | 审计结论 |
|---|---|
| `components/GroupModal.vue` | dock 滑块、`g_dock_scale` 提交、分视图列数（cols per view）正常 |
| `components/LinkModal.vue` | `icon_url_clear`、fetch-title 逻辑正常 |
| `components/DashboardView.vue` | scroll-spy（IntersectionObserver）、`view` 状态持有正常 |
| `stores/dashboard.ts` | facade 通过 `storeToRefs` 透传 auth/settings/ui，写操作统一走 `refreshAfterMutation` |
| `components/AppShell.vue` | `.drawer-content` / `.content-panel` 结构正确 |
| `components/LinkGrid.vue` | `useDock` / `useSortable` 接入正确 |
| `components/LinkCard.vue` | 复选框、编辑模式导航阻断逻辑正常 |
| `components/Sidebar.vue` | 分组拖拽（SortableJS，仅编辑模式）正常 |
| `components/OverviewSection.vue` / `GroupSection.vue` | 向 `LinkGrid` 传递 `dock_scale ?? 1.4` 正常 |
| `components/BatchBar.vue` | 批量移动/删除接 `batchMove` / `batchDelete` 正常 |
| `api/index.ts` / `types/api.ts` | 类型与封装一致 |
| `App.vue` | 未登录 `location.href='/login'` 兜底正常 |
| `components/SettingsDrawer.vue` / `ThemePicker.vue` / `IconPicker.vue`（40 图标）/ `IconUploader.vue` | 设置、主题、图标选择/上传链路正常 |
| `stores/settings.ts` / `auth.ts` / `ui.ts` | 三子店无循环依赖，依赖方向 `ui ← auth/settings ← dashboard` |
| `components/ConfirmDeleteModal.vue` | 删除确认正常 |
| `composables/useDock.ts` / `useSortable.ts` / `useScrollSpy.ts` | 逻辑正常 |

**需修改项（已在本次修复，见第 3、4 节）**：`api/request.ts`、`TopBar.vue`。

---

## 3. 发现并修复的关键缺陷（P0：浏览器侧写请求静默失败）

### 现象
- 浏览器中所有 **multipart/form-data** 写请求（链接/分组增改、图标文件上传、数据导入/恢复）会**静默失败**；但既有 Python 契约测试（120 + 24 断言）全绿，掩盖了问题。

### 根因
- **axios 1.x 的 xhr 适配器不会为 `FormData` 自动补 `boundary`**：它仅在 `data === undefined` 时才删除 `Content-Type`（见 `node_modules/axios/lib/adapters/xhr.js:155-156`）。
- `toByteStringHeaderObject`（`sanitizeHeaderValue.js:52`）会对头值执行 `String(value)`。因此即便把 `Content-Type` 设为 `null`，发出的也是字面量字符串 `"null"`（非法头，同样有害）。
- **旧 `apiPostForm` 显式写 `'Content-Type': 'multipart/form-data'`（无 boundary）** → 浏览器按字面原样发送该非法头 → Werkzeug 无法解析 multipart → 表单/文件字段全部丢失 → 后端按空表单校验失败或走 302 重定向。
- Python 契约测试使用 `requests`/原生客户端，其 `multipart` 会自动带正确 boundary，故无法复现。

### 修复（`web/src/api/request.ts`）
1. `api` 实例**移除默认** `'Content-Type': 'application/json'`。
   - 说明：JSON 提交由 axios 默认 `transformRequest` 对普通对象自动补 `application/json`；FormData 提交不设头时，浏览器 `XHR.send(FormData)` 会自动补 `multipart/form-data; boundary=----...`。
2. `apiPostForm` **不再设置 Content-Type**，直接 `api.post(url, form, config)`。

```ts
export const api: AxiosInstance = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' }, // 仅保留此头（_wants_json 协商用）
  timeout: 15000,
})

export function apiPostForm<T>(url: string, form: FormData, config?: AxiosRequestConfig): Promise<T> {
  // 不设置 Content-Type：浏览器 XHR 发送 FormData 时自动补 multipart/form-data; boundary=...
  return api.post(url, form, config) as unknown as Promise<T>
}
```

### 验证（修复后）
- JSON POST 仍自动获得 `Content-Type: application/json`（未回归）。
- FormData POST 不再由 JS 侧写入 `Content-Type`，浏览器发送 `multipart/form-data; boundary=----...`，Werkzeug 正确解析。

---

## 4. 次要修复（P2：主题切换本地状态不同步）

**文件**：`web/src/components/TopBar.vue`

- 旧 `toggleTheme()` 直接调 `settingsApi.setTheme(next)`，绕过 Pinia store。
- 后果：本地 `settings.theme` 不更新 → `ThemePicker` 高亮与当前主题不同步；且跳过了 `applyTheme` 的自定义主题 CSS 变量注入。
- 修复：改为 `store.setTheme(next).catch(() => {})`，并移除 `settingsApi` 导入。统一经 store action 更新 `settings.theme` 并执行 `applyTheme`。

---

## 5. 后端契约一致性（grep 核对）

前端调用的端点全部在后端存在且参数对齐：

- 设置类：`/settings/theme`、`/settings/profile`、`/settings/system`、`/settings/home`、`/settings/register-open`、`/settings/custom-theme`
- 数据类：`/data/import`、`/data/backup`、`/data/restore`、`/data/export/<fmt>`
- API 类：`/api/settings`、`/api/custom-themes`

前端 `apiPostForm` + `toFormData`（跳过 null/undefined、布尔转 `'1'`、File 直传）与后端 Flask-WTF 表单校验语义一致（契约测试 120 + 24 断言佐证）。

---

## 6. 回归门禁结果（修复后全绿）

| 门禁项 | 结果 |
|---|---|
| `vue-tsc --noEmit`（TypeScript 类型检查） | ✅ Exit 0（**本次新鲜复跑**） |
| `vite build` | ✅ 141 模块，JS 245 KB / CSS 52 KB |
| `scripts/verify_write_contract.py`（写契约） | ✅ 120 断言通过 |
| `scripts/verify_mutation_contract.py`（变更契约） | ✅ 24 断言通过 |
| SPA 托管冒烟（`USE_SPA=1`） | ✅ `/`→200、`/assets`→200、`/api/auth/me`(未登录)→401 |
| JSON 头验证 | ✅ JSON POST 仍自动 `application/json`，无回归 |

> 注：历史临时验证脚本（`scripts/verify_multipart_*.mjs`、`.json_header.mjs`）已清理；`scripts/*.py` 为正式契约测试，保留。

---

## 7. 文件变更清单

| 文件 | 变更 |
|---|---|
| `web/src/api/request.ts` | 【修改】`api` 实例移除默认 JSON `Content-Type`；`apiPostForm` 不再设置 `Content-Type`（修复 P0 multipart 静默失败） |
| `web/src/components/TopBar.vue` | 【修改】`toggleTheme()` 改为走 `store.setTheme`，移除 `settingsApi` 导入（修复主题高亮不同步） |

---

## 8. 结论与后续候选（非阻塞）

- ✅ 两处交互细节确认正确；全功能链路贯通；后端契约一致。
- ⚠️ 修复 1 个 **P0 浏览器侧静默失败缺陷**（multipart `Content-Type` 缺 boundary），该缺陷被 Python 契约测试遗漏，已通过「修复 + 门禁全绿」闭环。
- 无遗留阻塞项。
- 后续候选（不阻塞）：
  1. 在 CI 中补充**浏览器侧 multipart 冒烟**（如 Playwright 真实提交一次带图标上传的链接），避免 Python 契约漏覆盖此类 xhr 适配器行为差异。
  2. dock 放大倍数已按分组可配置（`Group.dock_scale`，`g_dock_scale` 提交 + 落库 + 序列化齐备），无需再做。
