<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { GroupDTO } from '@/types/api'
import AppIcon from './AppIcon.vue'
import LinkGrid from './LinkGrid.vue'

const props = defineProps<{ group: GroupDTO }>()

const store = useDashboardStore()

const isRect = computed(() => (props.group.card_style || 'card') === 'link')
const cols = computed(() =>
  isRect.value
    ? props.group.links_per_row_rect ?? 12
    : props.group.links_per_row ?? 4
)
const links = computed(() => props.group.links ?? [])
</script>

<template>
  <section :id="'sec-' + group.id" class="mb-8">
    <div class="dash-hero">
      <h1 class="section-title">{{ group.name }}</h1>
      <!-- 新增链接时预设所属分组（未分组段 id=0，正好对应「未分组」选项） -->
      <button
        type="button"
        class="hero-add"
        title="新增链接"
        aria-label="新增链接"
        @click="store.openAddLink(group.id)"
      >
        <AppIcon name="plus" :size="16" />
      </button>
      <span class="section-sub">{{ links.length }} 个链接</span>
    </div>

    <LinkGrid
      v-if="links.length"
      :group-id="group.id"
      :links="links"
      :is-rect="isRect"
      :show-title="group.show_title"
      :cols="cols"
      :title-fs="group.title_font_size || 'base'"
      :max-len="group.title_max_len ?? 0"
      :row-gap="group.row_gap ?? 16"
      :col-gap="group.col_gap ?? 16"
      :dock-scale="group.dock_scale ?? store.settings?.dock_scale ?? 1.4"
    />
    <div v-else class="empty-state"><p>该分组暂无链接。</p></div>
  </section>
</template>
