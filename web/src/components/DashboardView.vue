<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { GroupDTO } from '@/types/api'
import AppIcon from './AppIcon.vue'
import GroupSection from './GroupSection.vue'
import OverviewSection from './OverviewSection.vue'
import WorkbenchView from './WorkbenchView.vue'
import { useScrollSpy } from '@/composables/useScrollSpy'

const store = useDashboardStore()

// 滚动联动：当前视图分段进入视口中心时，上报 id 给 store 供侧栏高亮
useScrollSpy(
  () => document.querySelector('.drawer-content'),
  () => {
    // 触碰响应式依赖，确保数据刷新 / 视图切换后重建观察器
    void store.view
    void store.groups.length
    void store.sections.length
    void (store.ungrouped?.count ?? 0)
    const root = document.querySelector('.drawer-content')
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>('[id^="sec-"]')).map((el) => ({
      id: Number(el.id.replace('sec-', '')),
      el,
    }))
  },
  (id) => store.setActiveSection(id)
)

/** 总览视图的链接总数（对应 Jinja 的 total_links） */
const totalLinks = computed(() =>
  store.sections.reduce((n, s) => n + s.links.length, 0)
)

// 未分组：构造一个伪分组，复用 GroupSection 渲染（沿用用户级 links_per_row 默认）
const ungroupedSection = computed<GroupDTO | null>(() => {
  const u = store.ungrouped
  if (!u || u.count === 0) return null
  return {
    id: 0,
    name: u.name,
    icon: 'inbox',
    sort_order: 0,
    category: store.currentCategory,
    card_style: 'card',
    links_per_row: store.settings?.links_per_row ?? 4,
    links_per_row_rect: store.settings?.links_per_row_rect ?? 12,
    links_per_row_overview: null,
    links_per_row_rect_overview: null,
    title_font_size: 'base',
    title_max_len: 0,
    show_title: true,
    row_gap: 16,
    col_gap: 16,
    dock_scale: 1.4,
    created_at: null,
    links: u.links,
  }
})

/** 分组视图当前展示的分组：按 store.navGroupId 过滤，仅渲染单个分组（含未分组段 id=0） */
const navGroup = computed<GroupDTO | null>(() => {
  const id = store.navGroupId
  if (id === null) return null
  if (id === 0) return ungroupedSection.value
  return store.groups.find((g) => g.id === id) ?? null
})
</script>

<template>
  <div>
    <div v-if="!store.authed" class="empty-state">
      <p>请先登录后查看导航。</p>
    </div>

    <div v-else-if="store.loading" class="empty-state">
      <p>加载中…</p>
    </div>

    <div v-else-if="store.error" class="empty-state">
      <p class="text-red-500">{{ store.error }}</p>
    </div>

    <template v-else-if="store.isWorkbench">
      <WorkbenchView />
    </template>
    <template v-else-if="store.view === 'nav'">
      <GroupSection v-if="navGroup" :key="navGroup.id" :group="navGroup" />
      <div v-if="store.isEmpty" class="empty-state">
        <p>还没有任何链接，点击左上角「+ 新建分组」开始吧～</p>
      </div>
    </template>

    <template v-else>
      <div class="dash-hero">
        <h1 class="section-title">全部链接 · 总览</h1>
        <button
          type="button"
          class="hero-add"
          title="新增链接"
          aria-label="新增链接"
          @click="store.openAddLink(0)"
        >
          <AppIcon name="plus" :size="16" />
        </button>
        <span class="section-sub">共 {{ totalLinks }} 个链接 · 滚动浏览，左侧自动定位</span>
      </div>

      <!-- #ov-top 为侧栏「回到顶部」与滚动定位（阶段 3-I）的锚点 -->
      <div id="ov-top"></div>
      <div class="overview">
        <OverviewSection v-for="s in store.sections" :key="s.id" :section="s" />
      </div>
      <div v-if="store.isEmpty" class="empty-state">
        <p>还没有任何链接。</p>
      </div>
    </template>
  </div>
</template>
