/**
 * ssr-check.ts —— Vue 组件 ↔ Jinja 宏 结构一致性回归测试
 * ========================================================
 * 目的：在没有浏览器的环境下，把组件渲染成 HTML 字符串，逐项断言它与
 * app/templates/dashboard.html 里的 `link_card` 宏 / `.nav-grid` 变量约定一致。
 *
 * 为什么必要：
 *   阶段 3 的验收标准是「零交互回归」。DOM 结构、class 名、data-* 属性、
 *   CSS 变量（--cols/--title-fs/--card-bg…）是旧 CSS 与旧 JS 的唯一契约面，
 *   任何一处漂移都会让样式或后续拖拽/批量逻辑静默失效。
 *
 * 运行：
 *   node_modules/.bin/vite build --ssr scripts/ssr-check.ts --outDir .ssr-out
 *   node .ssr-out/ssr-check.js
 */

import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createRequire } from 'node:module'
import path from 'node:path'

import { useDashboardStore } from '../src/stores/dashboard'
import DashboardView from '../src/components/DashboardView.vue'
import type { GroupDTO, LinkDTO, OverviewSectionDTO, UserSettingsDTO } from '../src/types/api'

// --- 让 AppIcon 在 Node 里也能取到图标数据（等价于浏览器的 <script src="/static/js/lucide.min.js">）
const require = createRequire(import.meta.url)
const lucide = require(
  path.resolve(process.cwd(), '../app/static/js/lucide.min.js')
) as { icons: Record<string, unknown> }
;(globalThis as any).window = { lucide }

// --- 固定夹具：覆盖 card / link(矩形) 两种样式与所有可选字段分支 -------------
function link(over: Partial<LinkDTO> & { id: number; title: string; url: string }): LinkDTO {
  return {
    group_id: 1,
    icon: 'github',
    icon_url: null,
    note: null,
    bg_color: null,
    title_color: null,
    sort_order: 0,
    created_at: null,
    ...over,
  }
}

const GROUP_CARD: GroupDTO = {
  id: 1,
  name: '开发工具',
  icon: 'code',
  sort_order: 0,
  category: 'nav',
  card_style: 'card',
  links_per_row: 5,
  links_per_row_rect: 12,
  links_per_row_overview: null,
  links_per_row_rect_overview: null,
  title_font_size: 'lg',
  title_max_len: 6,
  show_title: true,
  row_gap: 20,
  col_gap: 24,
  dock_scale: 1.4,
  created_at: null,
  links: [
    link({ id: 101, title: 'GitHub', url: 'https://github.com' }),
    // 备注 + 自定义配色 + 超长标题（触发截断）
    link({
      id: 102,
      title: '这是一个很长的链接标题需要截断',
      url: 'https://example.com/a',
      note: '带备注',
      bg_color: '#112233',
      title_color: '#ffcc00',
      icon: 'arrow-up-to-line',
    }),
    // 上传图标（走 img 分支）+ 无分组
    link({ id: 103, title: 'Uploaded', url: 'https://x.dev', icon_url: '/static/uploads/icons/icon_1.png', group_id: null }),
    // 未知图标名（应回退 Link）
    link({ id: 104, title: 'Unknown', url: 'https://y.dev', icon: 'definitely-not-an-icon' }),
  ],
}

const GROUP_RECT: GroupDTO = {
  ...GROUP_CARD,
  id: 2,
  name: '常用站点',
  icon: 'star',
  card_style: 'link',
  links_per_row_rect: 12,
  title_font_size: '10px',
  title_max_len: 0,
  show_title: false,
  row_gap: 8,
  col_gap: 8,
  dock_scale: 1.6,
  links: [link({ id: 201, title: 'Rect', url: 'https://r.dev', group_id: 2 })],
}

const SETTINGS: UserSettingsDTO = {
  theme: 'light',
  links_per_row: 4,
  links_per_row_rect: 12,
  session_days: 7,
  open_in_new: true,
  default_home: null,
  dock_scale: 1.4,
  default_category: 'nav',
}

const OV_SECTION: OverviewSectionDTO = {
  id: 0,
  name: '未分组',
  icon: 'inbox',
  is_rect: false,
  cols: 3,
  title_fs: '2xl',
  maxlen: 0,
  show_title: true,
  dock_scale: 1.2,
  row_gap: 12,
  col_gap: 14,
  links: [link({ id: 301, title: 'Loose', url: 'https://l.dev', group_id: null })],
}

// --- 断言机制 ---------------------------------------------------------------
const failures: string[] = []
let checks = 0

function ok(cond: boolean, msg: string) {
  checks++
  if (!cond) failures.push(msg)
}

function has(html: string, needle: string, label: string) {
  ok(html.includes(needle), `${label}：未找到 \`${needle}\``)
}

function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1
}

/** 设 DUMP=<片段名> 可打印该次渲染的 HTML，便于定位断言失败 */
function dump(label: string, html: string) {
  if (process.env.DUMP && (process.env.DUMP === '*' || process.env.DUMP === label)) {
    console.log(`\n----- ${label} -----\n${html}\n`)
  }
  return html
}

async function render(mutate: (s: ReturnType<typeof useDashboardStore>) => void) {
  const app = createSSRApp(DashboardView)
  const pinia = createPinia()
  app.use(pinia)
  // setActivePinia 由 app.use 完成；store 需在 app 上下文里取
  const store = useDashboardStore(pinia)
  store.authed = true
  store.loading = false
  store.error = null
  store.settings = SETTINGS
  mutate(store)
  return await renderToString(app)
}

async function main() {
  // ========== 1) 导航视图 / card 样式 ==========
  const navHtml = await render((s) => {
    s.view = 'nav'
    s.groups = [GROUP_CARD]
    s.ungrouped = { id: 0, name: '未分组', count: 0, links: [] }
  })

  has(navHtml, 'id="sec-1"', 'GroupSection 锚点')
  has(navHtml, 'class="dash-hero"', 'Hero 头部')
  has(navHtml, 'class="section-title"', '分组标题')
  has(navHtml, 'class="hero-add"', '新增按钮')

  // .nav-grid 的 CSS 变量约定（旧 CSS 靠这些变量算布局）
  has(navHtml, 'class="nav-grid"', 'nav-grid 容器（card 样式不应带 grid--link）')
  ok(!navHtml.includes('grid--link'), 'card 样式误加了 grid--link')
  ok(!navHtml.includes('grid-no-title'), 'show_title=true 时误加了 grid-no-title')
  has(navHtml, 'data-dock-scale="1.4"', 'dock 放大倍数')
  has(navHtml, '--cols:5', '--cols')
  has(navHtml, '--cols-md:4', '--cols-md（min(4, cols)）')
  has(navHtml, '--title-fs:1.15rem', "--title-fs（lg → 1.15rem，与 _fs_map 对齐）")
  has(navHtml, '--row-gap:20px', '--row-gap')
  has(navHtml, '--col-gap:24px', '--col-gap')

  // link_card 宏的 data-* 契约
  has(navHtml, 'class="link-card"', 'link-card')
  has(navHtml, 'data-id="101"', 'data-id')
  has(navHtml, 'data-title="GitHub"', 'data-title')
  has(navHtml, 'data-url="https://github.com"', 'data-url')
  has(navHtml, 'data-icon="github"', 'data-icon')
  has(navHtml, 'data-group="1"', 'data-group')
  has(navHtml, 'data-group="0"', 'data-group 空分组回落 0')
  has(navHtml, 'data-iconurl="/static/uploads/icons/icon_1.png"', 'data-iconurl')
  has(navHtml, 'data-bg="#112233"', 'data-bg')
  has(navHtml, 'data-tc="#ffcc00"', 'data-tc')
  has(navHtml, '--card-bg:#112233', '--card-bg 内联变量')
  has(navHtml, '--card-tc:#ffcc00', '--card-tc 内联变量')
  ok(
    countOf(navHtml, 'data-bg=') === 1 && countOf(navHtml, 'data-tc=') === 1,
    '无配色的卡片不应输出空的 data-bg/data-tc'
  )

  // 勾选框 / 主体 / 操作区
  has(navHtml, 'class="link-check"', 'link-check')
  has(navHtml, 'class="link-checkbox"', 'link-checkbox')
  has(navHtml, 'class="check-box"', 'check-box')
  has(navHtml, 'points="20 6 9 17 4 12"', '勾选 svg 路径')
  has(navHtml, 'class="link-main"', 'link-main')
  has(navHtml, 'target="_blank"', 'open_in_new=true → _blank')
  has(navHtml, 'rel="noopener noreferrer"', 'rel')
  has(navHtml, 'class="link-icon"', 'link-icon')
  has(navHtml, 'class="link-icon-img"', '上传图标走 img 分支')
  has(navHtml, 'class="link-body"', 'link-body')
  has(navHtml, 'class="link-title"', 'link-title')
  has(navHtml, 'class="link-note"', 'link-note')
  has(navHtml, 'class="link-actions"', 'link-actions')
  has(navHtml, 'class="act-label"', 'act-label')
  has(navHtml, 'btn btn-sm btn-ghost text-error gap-1', '删除按钮类名')

  // 标题截断：maxlen=6 → 前 6 字 + …
  has(navHtml, '这是一个很长…', '标题截断（maxlen=6）')
  ok(!navHtml.includes('这是一个很长的链接标题需要截断<'), '截断后不应仍输出完整标题文本')

  // 图标渲染：来自 window.lucide，且未知名回退 Link
  has(navHtml, 'class="lucide lucide-github"', 'lucide 图标类名')
  has(navHtml, 'class="lucide lucide-arrow-up-to-line"', 'kebab 多段图标名解析')
  has(navHtml, 'class="lucide lucide-definitely-not-an-icon"', '未知图标名仍渲染（回退 Link 图形）')
  has(navHtml, 'class="lucide lucide-pencil w-4 h-4"', '编辑图标带 w-4 h-4')
  has(navHtml, 'class="lucide lucide-trash-2 w-4 h-4"', '删除图标带 w-4 h-4')
  ok(
    /<svg[^>]*stroke="currentColor"[^>]*>/.test(navHtml),
    '图标 svg 应保留 stroke="currentColor"（随主题变色）'
  )
  has(navHtml, 'viewBox="0 0 24 24"', '图标 viewBox')

  // ========== 2) 矩形卡片 / 无标题 ==========
  const rectHtml = await render((s) => {
    s.view = 'nav'
    s.groups = [GROUP_RECT]
    s.ungrouped = null
  })
  has(rectHtml, 'nav-grid grid--link grid-no-title', 'link 样式 + 隐藏标题的类名组合')
  has(rectHtml, 'data-dock-scale="1.6"', '矩形卡片 dock 倍数')
  has(rectHtml, '--cols:12', '矩形卡片列数取 links_per_row_rect')
  has(rectHtml, '--title-fs:10px', "--title-fs（10px 档位原样输出）")
  ok(!rectHtml.includes('class="link-body"'), 'show_title=false 时不应输出 link-body')
  has(rectHtml, 'aria-label="Rect"', '矩形卡片用 aria-label 而非 title')
  ok(!/<a class="link-main"[^>]*\stitle="/.test(rectHtml), '矩形卡片不应带 title 属性')

  // ========== 3) 总览视图 ==========
  const ovHtml = dump('overview', await render((s) => {
    s.view = 'overview'
    s.sections = [OV_SECTION]
  }))
  has(ovHtml, 'class="ov-section"', 'ov-section')
  has(ovHtml, 'class="ov-section-head"', 'ov-section-head')
  has(ovHtml, 'ov-sec-title', 'ov-sec-title')
  has(ovHtml, 'ov-sec-count', 'ov-sec-count')
  has(ovHtml, '--cols:3', '总览段列数')
  has(ovHtml, '--title-fs:1.6rem', "总览段 --title-fs（2xl → 1.6rem）")
  has(ovHtml, 'data-dock-scale="1.2"', '总览段 dock 倍数')
  // 父级传入的 class 会被 Vue 追加在组件自身 class 之后
  has(ovHtml, 'class="lucide lucide-inbox ov-sec-ic"', '总览段图标（含 ov-sec-ic）')

  // ========== 4) 状态分支 ==========
  const anonHtml = await render((s) => {
    s.authed = false
  })
  has(anonHtml, '请先登录', '未登录提示')

  const loadingHtml = await render((s) => {
    s.loading = true
  })
  has(loadingHtml, '加载中', '加载态提示')

  const errHtml = await render((s) => {
    s.error = '接口炸了'
  })
  has(errHtml, '接口炸了', '错误信息透出')

  const emptyHtml = await render((s) => {
    s.view = 'nav'
    s.groups = []
    s.ungrouped = { id: 0, name: '未分组', count: 0, links: [] }
  })
  has(emptyHtml, 'empty-state', '空态占位')

  // ========== 5) 搜索过滤 ==========
  const searchHtml = await render((s) => {
    s.view = 'nav'
    s.groups = [GROUP_CARD]
    s.ungrouped = null
    s.search = 'github'
  })
  ok(countOf(searchHtml, 'class="link-card"') === 1, '搜索 github 应只剩 1 张卡片')
  has(searchHtml, 'data-id="101"', '搜索命中的是 GitHub 卡片')

  const searchMissHtml = await render((s) => {
    s.view = 'nav'
    s.groups = [GROUP_CARD]
    s.ungrouped = null
    s.search = 'zzz-no-match'
  })
  has(searchMissHtml, '没有找到匹配的链接', '搜索无结果提示')

  // ========== 6) 未分组伪分组 ==========
  const ungHtml = await render((s) => {
    s.view = 'nav'
    s.groups = []
    s.ungrouped = { id: 0, name: '未分组', count: 1, links: [link({ id: 401, title: 'Solo', url: 'https://s.dev', group_id: null })] }
  })
  has(ungHtml, 'id="sec-0"', '未分组段锚点 sec-0')
  has(ungHtml, 'data-id="401"', '未分组链接渲染')
  has(ungHtml, '--cols:4', '未分组段沿用用户级 links_per_row=4')

  // --- 汇总 ---
  console.log(`\n== SSR 结构断言：共 ${checks} 项 ==`)
  if (failures.length) {
    console.log(`!! 失败 ${failures.length} 项：`)
    failures.forEach((f) => console.log(`   - ${f}`))
    process.exit(1)
  }
  console.log('✓ 全部通过：Vue 组件输出与 link_card 宏 / nav-grid 变量约定一致')
}

main().catch((e) => {
  console.error('SSR 渲染异常：', e)
  process.exit(2)
})
