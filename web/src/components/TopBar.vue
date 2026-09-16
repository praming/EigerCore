<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useWorkbenchStore } from '@/stores/workbench'
import { useSettingsStore } from '@/stores/settings'
import { authApi } from '@/api'
import AppIcon from './AppIcon.vue'
import CategorySwitch from './CategorySwitch.vue'
import ViewSwitch from './ViewSwitch.vue'
import SearchBox from './SearchBox.vue'
import SearchEngineBox from './SearchEngineBox.vue'

const store = useDashboardStore()
const wb = useWorkbenchStore()
const settingsStore = useSettingsStore()

// 站点品牌（站点级，全站统一一套）：导航栏品牌文字 / 副标题 / logo 均来自 siteSettings，缺省回退默认值
const siteName = computed(() => settingsStore.siteSettings?.site_name || 'Eiger')
const siteSubtitle = computed(() => settingsStore.siteSettings?.site_subtitle || '')
const siteLogo = computed(() => settingsStore.siteSettings?.site_logo || '')
// 文档标题：优先 site_title，否则回退「站点名称 · 个人导航」
const siteTitle = computed(() => settingsStore.siteSettings?.site_title || '')
watch(
  () => [siteTitle.value, siteName.value],
  () => {
    document.title = siteTitle.value || `${siteName.value} · 个人导航`
  },
  { immediate: true }
)

// 顶栏编辑按钮上下文感知：工作台视图下切换工作台布局编辑态，否则切换导航编辑态
const effectiveEdit = computed(() => (store.isWorkbench ? wb.editMode : store.editMode))
function toggleEditMode() {
  if (store.isWorkbench) wb.toggleEdit()
  else store.toggleEdit()
}
const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'add-link'): void
  (e: 'open-widget-library'): void
  (e: 'open-profile'): void
}>()

const isDark = ref(
  (document.documentElement.getAttribute('data-theme') || 'light') === 'dark'
)

function toggleTheme() {
  isDark.value = !isDark.value
  const next = isDark.value ? 'dark' : 'light'
  // 走 store action：统一更新 settings.theme 并执行 applyTheme（含自定义主题 CSS 变量注入），
  // 避免直接调 /settings/theme 导致本地状态与 ThemePicker 高亮不同步。
  store.setTheme(next).catch(() => {})
}

function onLogout() {
  authApi.logout().finally(() => location.reload())
}
</script>

<template>
  <div class="app-nav">
    <div class="flex-none flex items-center gap-1">
      <a class="brand-logo">
        <img v-if="siteLogo" :src="siteLogo" alt="站点 Logo" class="logo-mark logo-mark--img" />
        <span v-else class="logo-mark"><AppIcon name="mountain" :size="20" /></span>
        <span class="brand-text">
          <span class="brand-name">{{ siteName }}</span>
          <span v-if="siteSubtitle" class="brand-sub">{{ siteSubtitle }}</span>
        </span>
      </a>
      <CategorySwitch />
    </div>

    <div class="flex-1 flex justify-center items-center px-2 gap-2">
      <SearchBox v-if="!store.isWorkbench" />
      <SearchEngineBox />
    </div>

    <div class="flex-none flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        class="icon-btn"
        :aria-label="isDark ? '切换浅色' : '切换深色'"
        @click="toggleTheme"
      >
        <AppIcon v-if="isDark" name="sun" :size="20" />
        <AppIcon v-else name="moon" :size="20" />
      </button>

      <ViewSwitch v-if="!store.isWorkbench" />

      <button
        type="button"
        class="icon-btn"
        :class="{ 'is-active': effectiveEdit }"
        :aria-label="effectiveEdit ? '退出编辑' : (store.isWorkbench ? '编辑工作台' : '编辑模式')"
        :title="store.isWorkbench ? '编辑工作台' : '编辑模式'"
        @click="toggleEditMode"
      >
        <AppIcon name="pencil" :size="16" />
      </button>

      <button
        v-if="store.isWorkbench"
        type="button"
        class="icon-btn"
        aria-label="小组件库"
        title="小组件库（管理所有小组件）"
        @click="emit('open-widget-library')"
      >
        <AppIcon name="layout-grid" :size="18" />
      </button>

      <button type="button" class="icon-btn" aria-label="设置" @click="emit('open-settings')">
        <AppIcon name="settings" :size="20" />
      </button>

      <div class="user-pill user-pill--btn" v-if="store.user" role="button" tabindex="0"
        @click="emit('open-profile')" @keydown.enter="emit('open-profile')">
        <div class="avatar" v-if="store.user.avatar">
          <img :src="store.user.avatar" alt="头像" />
        </div>
        <AppIcon v-else name="user" :size="16" />
        <span class="u-name">{{ store.user.nickname || store.user.username }}</span>
      </div>

      <button class="btn btn-outline btn-sm ml-1" @click="onLogout">退出</button>
    </div>
  </div>
</template>
