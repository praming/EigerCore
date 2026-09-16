<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { LinkDTO } from '@/types/api'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  link: LinkDTO
  isRect: boolean
  showTitle: boolean
  maxLen?: number
}>()

const store = useDashboardStore()
const openInNew = computed(() => store.settings?.open_in_new ?? true)

const cardStyle = computed(() => {
  const s: Record<string, string> = {}
  if (props.link.bg_color) s['--card-bg'] = props.link.bg_color
  if (props.link.title_color) s['--card-tc'] = props.link.title_color
  return s
})

const truncatedTitle = computed(() => {
  const t = props.link.title
  if (props.maxLen && props.maxLen > 0 && t.length > props.maxLen) {
    return t.slice(0, props.maxLen) + '…'
  }
  return t
})

const tip = computed(() =>
  [props.link.title, props.link.note].filter(Boolean).join(props.isRect ? ' — ' : '\n')
)
</script>

<template>
  <div
    class="link-card"
    :class="{ 'is-checked': store.isSelected(link.id) }"
    :data-id="link.id"
    :data-title="link.title"
    :data-url="link.url"
    :data-icon="link.icon || ''"
    :data-note="link.note || ''"
    :data-group="link.group_id || 0"
    :data-iconurl="link.icon_url || ''"
    :data-bg="link.bg_color || undefined"
    :data-tc="link.title_color || undefined"
    :style="cardStyle"
  >
    <label class="link-check" title="选择">
      <input
        type="checkbox"
        class="link-checkbox"
        :value="link.id"
        :checked="store.isSelected(link.id)"
        @change="store.toggleSelect(link.id)"
      />
      <span class="check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </span>
    </label>

    <a
      class="link-main"
      :href="store.editMode ? undefined : link.url"
      :target="openInNew ? '_blank' : '_self'"
      rel="noopener noreferrer"
      :aria-label="isRect ? tip : undefined"
      :title="isRect ? undefined : tip"
      @click="store.editMode && $event.preventDefault()"
    >
      <div class="link-icon">
        <img v-if="link.icon_url" :src="link.icon_url" alt="" class="link-icon-img" />
        <AppIcon v-else :name="link.icon || 'link'" :size="28" />
      </div>
      <div v-if="showTitle" class="link-body">
        <span class="link-title">{{ truncatedTitle }}</span>
        <span v-if="link.note" class="link-note">{{ link.note }}</span>
      </div>
    </a>

    <!-- 与 link_card 宏逐属性对齐：按钮无 title，图标用 w-4 h-4 类控制尺寸 -->
    <div class="link-actions">
      <button class="btn btn-sm btn-ghost gap-1" @click="store.openEditLink(link)">
        <AppIcon name="pencil" class="w-4 h-4" /> <span class="act-label">编辑</span>
      </button>
      <button class="btn btn-sm btn-ghost text-error gap-1" @click="store.askDeleteLink(link)">
        <AppIcon name="trash-2" class="w-4 h-4" /> <span class="act-label">删除</span>
      </button>
    </div>
  </div>
</template>
