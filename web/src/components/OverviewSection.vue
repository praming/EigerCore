<script setup lang="ts">
import type { OverviewSectionDTO } from '@/types/api'
import AppIcon from './AppIcon.vue'
import LinkGrid from './LinkGrid.vue'
import { useDashboardStore } from '@/stores/dashboard'

const props = defineProps<{ section: OverviewSectionDTO }>()
const store = useDashboardStore()
</script>

<template>
  <section class="ov-section" :id="'sec-' + section.id" :data-sec="section.id">
    <header class="ov-section-head">
      <AppIcon :name="section.icon || 'folder'" class="ov-sec-ic" :size="18" />
      <h2 class="ov-sec-title">{{ section.name }}</h2>
      <span class="ov-sec-count">{{ section.links.length }} 个链接</span>
    </header>

    <LinkGrid
      v-if="section.links.length"
      :group-id="section.id"
      :links="section.links"
      :is-rect="section.is_rect"
      :show-title="section.show_title"
      :cols="section.cols"
      :title-fs="section.title_fs || 'base'"
      :max-len="section.maxlen ?? 0"
      :row-gap="section.row_gap ?? 16"
      :col-gap="section.col_gap ?? 16"
      :dock-scale="section.dock_scale ?? store.settings?.dock_scale ?? 1.4"
    />
    <div v-else class="empty-state"><p>该分组暂无链接。</p></div>
  </section>
</template>
