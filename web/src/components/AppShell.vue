<script setup lang="ts">
import { watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useWorkbenchStore } from '@/stores/workbench'
import { useSettingsStore } from '@/stores/settings'
import TopBar from './TopBar.vue'
import Sidebar from './Sidebar.vue'
import DashboardView from './DashboardView.vue'
import LinkModal from './LinkModal.vue'
import GroupModal from './GroupModal.vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import SettingsDrawer from './SettingsDrawer.vue'
import ProfileModal from './ProfileModal.vue'
import ToastHost from './ToastHost.vue'
import BatchBar from './BatchBar.vue'

const store = useDashboardStore()
const wb = useWorkbenchStore()
const settingsStore = useSettingsStore()

// 编辑模式：通过 body.edit-mode 类驱动 CSS（.link-actions / .link-check 等仅在编辑态显示）
watch(
  () => store.editMode,
  (v) => document.body.classList.toggle('edit-mode', v),
  { immediate: true }
)
</script>

<template>
  <div class="app-shell">
    <TopBar
      @open-settings="store.openSettings(store.isWorkbench ? 'workbench' : 'nav')"
      @open-widget-library="wb.widgetLibraryOpen = true"
      @open-profile="settingsStore.openProfile()"
    />
    <div class="layout">
      <input id="main-drawer" type="checkbox" class="drawer-toggle" />
      <Sidebar v-if="!store.isWorkbench" />
      <div class="drawer-content">
        <div class="content-panel">
          <DashboardView />
        </div>
      </div>
    </div>

    <!-- 全局弹窗与轻提示：与 dashboard.html 一样常驻 DOM，由 open 状态驱动显隐 -->
    <LinkModal />
    <GroupModal />
    <ConfirmDeleteModal />
    <SettingsDrawer />
    <ProfileModal />
    <ToastHost />
    <!-- 批量操作条：仅在编辑模式且已勾选时挂载 -->
    <BatchBar v-if="store.batchBarVisible" />
  </div>
</template>
