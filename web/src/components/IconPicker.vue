<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 内置图标选择器 —— 提供一组精选 Lucide 图标供链接快速选配，
 * 作为「上传图片」之外的轻量替代（与 Jinja 版 icon 存储契约一致：只存图标名）。
 * 选中即 emit update:modelValue；点击「默认」清空为 ''（由 LinkModal 决定最终回退）。
 */

// 精选常用 Lucide 图标名（kebab-case），覆盖导航站常见语义
const BUILTIN_ICONS = [
  'compass', 'link', 'globe', 'bookmark', 'home', 'star',
  'settings', 'mail', 'message-circle', 'file-text', 'image', 'music',
  'video', 'calendar', 'user', 'package', 'shopping-cart', 'briefcase',
  'code', 'terminal', 'database', 'cloud', 'server', 'cpu',
  'wifi', 'phone', 'map-pin', 'heart', 'zap', 'bell',
  'search', 'folder', 'calculator', 'book-open', 'camera', 'gamepad-2',
  'newspaper', 'tv', 'coffee', 'graduation-cap', 'rocket', 'shield',
  'key', 'lock', 'tool', 'wrench', 'git-branch', 'box',
]

const props = defineProps<{
  /** 当前选中的图标名（受控） */
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const selected = computed(() => props.modelValue || '')

function pick(name: string) {
  emit('update:modelValue', name)
  emit('change', name)
}
function reset() {
  emit('update:modelValue', '')
  emit('change', '')
}
</script>

<template>
  <div class="icon-picker">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs uppercase tracking-wide text-base-content/50">或选择内置图标</span>
      <button
        type="button"
        class="text-xs px-2 py-1 rounded border border-base-300 hover:border-primary/50"
        :class="{ 'border-primary text-primary': selected === '' }"
        @click="reset"
      >
        默认
      </button>
    </div>
    <div class="icon-grid">
      <button
        v-for="ic in BUILTIN_ICONS"
        :key="ic"
        type="button"
        class="icon-cell"
        :class="{ 'is-active': selected === ic }"
        :title="ic"
        :aria-label="ic"
        @click="pick(ic)"
      >
        <AppIcon :name="ic" :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.icon-picker {
  margin-top: 0.5rem;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  gap: 6px;
  max-height: 168px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--b3, #e5e7eb);
  border-radius: 0.5rem;
  background: var(--b2, #f8fafc);
}
.icon-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  border-radius: 0.4rem;
  border: 1px solid transparent;
  color: var(--bc, #1f2937);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.icon-cell:hover {
  background: color-mix(in srgb, var(--p, #4f46e5) 10%, transparent);
}
.icon-cell.is-active {
  border-color: var(--p, #4f46e5);
  background: color-mix(in srgb, var(--p, #4f46e5) 14%, transparent);
  color: var(--p, #4f46e5);
}
</style>
