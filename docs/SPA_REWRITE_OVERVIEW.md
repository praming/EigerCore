# Python Nav —— Vue 3 SPA 改写 · 收尾总览

> 生成日期：2026-08-17 ｜ 状态：主线收口，最终回归全绿

## 目标
将原有的 Jinja 仪表盘改写为 **Vue 3 + Vite + TypeScript + Pinia** 单页应用（SPA），复用 `input.css` 设计系统；后端写接口通过请求头协商提供 JSON 契约，**Jinja 原生表单（flash + 302）逐字节不变**。要求零交互回归。

## 技术架构
- **前端**：Vue 3 `<script setup>` + Vite + TS + Pinia + Vue Router（`createWebHistory`）+ axios
- **设计系统**：复用 `app/static/src/input.css`（DaisyUI 风格 + glassmorphism + dock 放大）
- **前后端契约**：SPA 通过 `_wants_json()` 协商 JSON 回包；CSRF 由拦截器统一注入 `X-CSRF-Token`；axios `apiPostForm` 显式 `multipart/form-data`，避免 FormData 被 JSON 化
- **主题**：移植后端 `hex_to_hsl` / `on_color` 到 `lib/theme.ts`，`data-theme="custom:N"` 时注入 `--p/--s/--b1/--b2/--bc/--pc` CSS 变量

## 完成情况

### #121 写接口契约验证
- 脚本 `scripts/verify_write_contract.py`：**120 断言**（含 `icon_url_clear` 两分支）
- 关键修正：测试用 `Config` 子类传入 `create_app()` 覆盖 URI（`db.init_app` 在工厂内已绑引擎，事后改 `app.config` 无效）；清理真实库残留测试用户

### #122 设置 / 主题 / 图标
- 新增 `lib/theme.ts`、`ThemePicker.vue`、`SettingsDrawer.vue`、`IconPicker.vue`（40 个 Lucide 图标网格）
- 后端：`icon_url_clear` 字段（编辑时清除旧图标）、自定义配色 CRUD、`/api/settings`、`/api/custom-themes`、数据导入/导出/备份/还原

### #123 拖拽 / 批量 / 滚动联动 / dock
- `composables/useSortable` / `useDock` / `useScrollSpy` + 本地 `types/sortablejs.d.ts`
- `LinkGrid` 卡片可排序 + dock 邻近放大；`Sidebar` 分组拖拽 + 高亮；`BatchBar` + `LinkCard` 勾选批量移动/删除；`DashboardView` 滚动联动（`IntersectionObserver` 驱动侧栏高亮）
- 后端：`/update-order`、`/group/update-order`、`/batch`（delete / move）

### Phase 4 Pinia 细分
- 拆分 `auth` / `settings` / `ui` 三个独立 store；`dashboard` 作为**组合根 facade**，用 `storeToRefs` 重新导出三者状态与动作
- **18 个组件零改动**（`store.*` 访问方式保持不变），auth/settings/ui 经 facade 透传且保持响应式

### Phase 5 Flask 托管 SPA（USE_SPA 开关）
- `app/__init__.py`：`USE_SPA=1` 且 `web/dist/index.html` 存在时注册 `/assets/<path>` 与未匹配 GET 兜底返回 SPA 入口（支持深链）
- `app/routes.py`：`index()` / `_redirect_to_view()` / `dashboard()` 在 SPA 模式服务/跳转 SPA；保留 Jinja 登录页
- `web/src/App.vue`：`init()` 后未登录跳转 `/login`
- 新增 `serve_spa.py` 一键启动；`README.md` 增补 SPA 模式小节

### Dock 放大倍数（按分组可配置）
- **经查已实现**：`Group.dock_scale` 列 + 存量迁移 + `serializers.group_to_dict` 序列化 + `GroupModal` Dock 滑块（提交 `g_dock_scale`）+ 路由写回（钳制 1.0~2.5）
- 写接口契约中 `g_dock_scale` 提交/回读断言佐证其可用性

## 最终回归门禁（2026-08-17）

| 检查项 | 命令 / 范围 | 结果 |
| --- | --- | --- |
| 类型检查 | `vue-tsc --noEmit` | **Exit 0** |
| 生产构建 | `vite build` | **141 模块**，JS 245 KB / CSS 52 KB |
| 写接口契约 | `verify_write_contract.py` | **120 断言 ✓** |
| 拖拽/批量契约 | `verify_mutation_contract.py` | **24 断言 ✓** |
| SPA 托管冒烟 | `USE_SPA=1` 启 Flask | `/`→200、`/assets/*.js`→200、`/api/auth/me`(未登录)→401 |

## 运行方式
```bash
# 1. 构建前端（产物输出到 web/dist）
cd web && npm install && npm run build

# 2. 以 SPA 模式启动（等价于 USE_SPA=1 python run.py）
python serve_spa.py
# 访问 http://127.0.0.1:5000

# 不传 USE_SPA 时仍是原 Jinja 仪表盘，可随时回退（零回归）
python run.py
```

## 关键文件
- 前端 store：`web/src/stores/{auth,settings,ui,dashboard}.ts`
- 前端组件：`AppShell` / `TopBar` / `Sidebar` / `LinkGrid` / `LinkCard` / `BatchBar` / `SettingsDrawer` / `ThemePicker` / `IconPicker` / `GroupModal` / `LinkModal` / `DashboardView`
- 后端：`app/__init__.py`、`app/routes.py`、`app/serializers.py`、`app/models.py`
- 契约测试：`scripts/verify_write_contract.py`、`scripts/verify_mutation_contract.py`

## 后续可选方向
- 路由级 SPA（当前兜底回退方案，深链已支持 `createWebHistory`）
- 工作台 / 资讯分类级设置迁移到 `CategorySettings`（实现全局/分类级设置分离）
- 指定交互细节的进一步打磨
