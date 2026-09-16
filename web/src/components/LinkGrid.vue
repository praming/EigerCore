<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { LinkDTO, TitleFontSize } from '@/types/api'
import LinkCard from './LinkCard.vue'
import { useSortable } from '@/composables/useSortable'
import { useDock } from '@/composables/useDock'

const props = defineProps<{
  /** 所属分组 / 分段的 id（未分组段为 0），供拖拽后提交 /update-order */
  groupId: number
  links: LinkDTO[]
  isRect: boolean
  showTitle: boolean
  cols: number
  titleFs?: TitleFontSize | null
  maxLen?: number
  rowGap?: number
  colGap?: number
  dockScale?: number
}>()

const store = useDashboardStore()
const gridEl = ref<HTMLElement | null>(null)

/** 与 dashboard.html 的 _fs_map 保持一致（--title-fs 由分组设置控制） */
const FS_MAP: Record<TitleFontSize, string> = {
  '10px': '10px',
  '12px': '12px',
  sm: '0.85rem',
  base: '1rem',
  lg: '1.15rem',
  xl: '1.35rem',
  '2xl': '1.6rem',
}

const gridStyle = computed(() => ({
  '--cols': String(props.cols),
  '--cols-md': String(Math.min(4, props.cols)),
  '--title-fs': FS_MAP[props.titleFs || 'base'] || '1rem',
  '--row-gap': (props.rowGap ?? 16) + 'px',
  '--col-gap': (props.colGap ?? 16) + 'px',
}))

const filtered = computed(() => {
  const q = store.search.trim().toLowerCase()
  if (!q) return props.links
  return props.links.filter(
    (l) => l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
  )
})

// 拖拽排序：仅在编辑模式启用；onEnd 后按 DOM 新顺序提交后端
const dragDisabled = computed(() => !store.editMode)
useSortable(
  gridEl,
  () => ({
    group: 'links',
    animation: 160,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: '.link-card',
    filter: 'button, input, .link-check',
    onEnd: () => {
      const ids = Array.from(gridEl.value?.querySelectorAll<HTMLElement>('.link-card') ?? [])
        .map((el) => Number(el.dataset.id))
        .filter((n) => Number.isFinite(n))
      if (ids.length) store.reorderLinks(props.groupId, ids)
    },
  }),
  { disabled: dragDisabled }
)

// Dock 邻近放大：浏览模式生效（编辑模式让位给拖拽）
useDock(gridEl, () => props.dockScale ?? 1.4, { disabled: computed(() => store.editMode) })
</script>

<template>
  <div
    ref="gridEl"
    class="nav-grid"
    :class="{ 'grid--link': isRect, 'grid-no-title': !showTitle }"
    :data-dock-scale="dockScale ?? 1.4"
    :style="gridStyle"
  >
    <LinkCard
      v-for="l in filtered"
      :key="l.id"
      :link="l"
      :is-rect="isRect"
      :show-title="showTitle"
      :max-len="maxLen ?? 0"
    />
    <div v-if="store.search && filtered.length === 0" class="empty-state">
      <p>没有找到匹配的链接。</p>
    </div>
  </div>
</template>
