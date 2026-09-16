<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { THEME_CHOICES } from '@/lib/theme'
import type { CustomThemeDTO } from '@/types/api'

const store = useDashboardStore()

// 是否显示内置主题的删除（×）按钮：由设置页「主题」标题处的开关控制
const { showDelete = true } = defineProps<{ showDelete?: boolean }>()
// 编辑自定义配色：把目标主题抛给设置页表单进入编辑态
const emit = defineEmits<{ edit: [theme: CustomThemeDTO] }>()

// 内置主题按「已隐藏清单」过滤：可见列表 + 已隐藏列表（用于恢复）
const hidden = computed(() => new Set(store.hiddenBuiltinThemes || []))
const visibleThemes = computed(() =>
  THEME_CHOICES.filter((t) => !hidden.value.has(t.name))
)
const hiddenThemes = computed(() =>
  THEME_CHOICES.filter((t) => hidden.value.has(t.name))
)

function isActive(name: string) {
  return store.settings?.theme === name
}
function pick(name: string) {
  store.setTheme(name)
}
function pickCustom(id: number) {
  store.setTheme(`custom:${id}`)
}
function isCustomActive(id: number) {
  return store.settings?.theme === `custom:${id}`
}
function removeBuiltin(name: string) {
  store.deleteBuiltinTheme(name)
}
function restoreBuiltin(name: string) {
  store.restoreBuiltinTheme(name)
}
</script>

<template>
  <div class="theme-picker">
    <div class="text-xs uppercase tracking-wide text-muted mb-2">内置主题</div>
    <div class="flex flex-wrap gap-2">
      <div v-for="t in visibleThemes" :key="t.name" class="relative group">
        <button
          type="button"
          class="theme-chip"
          :class="[isActive(t.name) ? 'active' : '', showDelete ? 'pr-7' : '']"
          @click="pick(t.name)"
        >
          {{ t.label }}
        </button>
        <button
          v-if="showDelete"
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:text-error leading-none px-1 text-lg opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          aria-label="隐藏主题"
          title="隐藏主题（悬停显示）"
          @click="removeBuiltin(t.name)"
        >
          ×
        </button>
      </div>
    </div>

    <div v-if="hiddenThemes.length" class="mt-3">
      <div class="text-xs uppercase tracking-wide text-muted mb-1">已隐藏</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in hiddenThemes"
          :key="t.name"
          type="button"
          class="theme-chip border-dashed"
          :title="`恢复「${t.label}」`"
          @click="restoreBuiltin(t.name)"
        >
          + {{ t.label }}
        </button>
      </div>
    </div>

    <div class="text-xs uppercase tracking-wide text-muted mt-5 mb-2">
      自定义配色
      <span v-if="store.customThemes.length" class="ml-1">({{ store.customThemes.length }})</span>
    </div>
    <div v-if="store.customThemes.length" class="flex flex-col gap-1.5">
      <div
        v-for="c in store.customThemes"
        :key="c.id"
        class="flex items-center justify-between rounded-lg border px-3 py-2"
        :class="isCustomActive(c.id) ? 'border-primary bg-primary-soft' : 'border-subtle'"
      >
        <button type="button" class="flex items-center gap-2 text-sm" @click="pickCustom(c.id)">
          <span class="inline-flex items-center gap-1">
            <span
              class="inline-block h-4 w-4 rounded-full border border-subtle"
              :style="{ backgroundColor: c.primary }"
            ></span>
            <span
              class="inline-block h-2.5 w-2.5 rounded-full border border-subtle"
              :style="{ backgroundColor: c.accent || '#f59e0b' }"
            ></span>
          </span>
          <span :class="{ 'text-primary font-medium': isCustomActive(c.id) }">{{ c.name }}</span>
        </button>
        <button
          type="button"
          class="text-muted hover:text-primary text-lg leading-none px-1"
          aria-label="编辑配色"
          title="编辑配色"
          @click="emit('edit', c)"
        >
          ✎
        </button>
        <button
          type="button"
          class="text-muted hover:text-error text-lg leading-none px-1"
          aria-label="删除配色"
          title="删除配色"
          @click="store.deleteCustomTheme(c.id)"
        >
          ×
        </button>
      </div>
    </div>
    <div v-else class="text-sm text-muted">暂无自定义配色，可在下方「自定义配色」添加</div>
  </div>
</template>
