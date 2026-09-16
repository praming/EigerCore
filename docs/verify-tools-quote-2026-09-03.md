# 真机验证报告（每日一言 · 工具箱扩展）

验证时间：2026-09-03 ｜ 方式：playwright-core + 系统 Edge 无头 ｜ 探针用户 `wb_probe4`（`default_view='workbench'`，已清理）

## 结论：20/20 全绿 ✅

### A. 每日一言 —— 严格按间隔、关闭每次打开随机

| 检查项 | 结果 | 说明 |
|---|---|---|
| 预置缓存 reload 不随机 | PASS | 预置 `wb_quote_v1`，重新加载后仍显示同一句（不重新拉取、不随机） |
| 刷新间隔 8 档 | PASS | 关闭 / 1 分钟 / 15 分钟 / 30 分钟 / 1 小时 / 6 小时 / 12 小时 / 24 小时 |
| 切换 1 分钟持久化 | PASS | `refreshMinutes=1` 写入 `wb_state_v1.prefs.quote` |
| 手动「换一句」换新 | PASS | 点刷新后引号改变（命中 hitokoto 真句） |

### B. 工具箱 —— 11 工具 / 标题开关 / 间距 / 拖拽排序

| 检查项 | 结果 | 说明 |
|---|---|---|
| 11 个小工具图标 | PASS | 计算器 / 金额大小写 / 年龄计算 / 番茄钟 / 单位换算 / 长度换算 / 重量换算 / Base64 / 日期推算 / 时间戳转换 / 农历转换 |
| 7 个新工具弹窗 | PASS | 单位换算、长度换算、重量换算、Base64、日期推算、时间戳转换、农历转换 均可打开且含可交互区域 |
| 设置页打开 | PASS | 标题「实用工具箱 · 设置」 |
| 显示小工具标题开关 | PASS | 关闭后 `.wb-tools__grid.is-noname` 生效，`showTitle=false` 落盘 |
| 行/列间距越界钳制 | PASS | 列填 99 被钳到上限 24，`rowGap=24 colGap=24` |
| 小工具拖拽排序 | PASS | 第 1 行拖到第 3 行，顺序与 `order` 同步变更 |
| 恢复默认顺序 | PASS | 点击后 `order` 回到默认 11 项序列 |

### 关键实现要点
- **每日一言**：`useQuote.ts` 用 `localStorage` 缓存 + `lastAt` 时间戳做间隔判定基准；仅「无缓存或已超间隔」才拉取，否则显示上一次（关闭每次打开随机）。点「换一句」始终换新。
- **工具箱**：`stores/workbench.ts` 的 `tools` 升级为 `{showTitle, rowGap, colGap, order}`；`TOOL_META` 注册表被卡片网格与设置页排序列表共用；`reorderTools()` 原地 splice（避免响应式脱钩）；`convert.ts` 承载换算/Base64/日期工具。
- **无 console / 页面错误**。

### 构建产物
`web/dist`：`index-C5nvugxh.js` / `index-BlHddmDt.css`（:5000 单进程服务自动读取，无需重启）。旧包已清理。

> 提示：浏览器需**硬刷新**（Ctrl/Cmd+Shift+R）以加载新哈希资源。
