<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { Component } from 'vue'
import { useWorkbenchStore, type CardId } from '@/stores/workbench'
import { useSortable } from '@/composables/useSortable'
import TimeCard from './workbench/TimeCard.vue'
import WeatherCard from './workbench/WeatherCard.vue'
import CountdownCard from './workbench/CountdownCard.vue'
import DayCountCard from './workbench/DayCountCard.vue'
import CalendarCard from './workbench/CalendarCard.vue'
import TodoCard from './workbench/TodoCard.vue'
import NoteCard from './workbench/NoteCard.vue'
import WatchlistCard from './workbench/WatchlistCard.vue'
import ToolsCard from './workbench/ToolsCard.vue'
import BiddingCard from './workbench/BiddingCard.vue'
import LinksCard from './workbench/LinksCard.vue'
import HotlistCard from './workbench/HotlistCard.vue'
import WorldClockCard from './workbench/WorldClockCard.vue'
import QuoteBar from './workbench/QuoteBar.vue'
import WbCardSettings from './WbCardSettings.vue'
import WidgetLibraryModal from './WidgetLibraryModal.vue'
import AppIcon from './AppIcon.vue'

const wb = useWorkbenchStore()
const gridRef = ref<HTMLElement | null>(null)
const settingsCardId = ref<string | null>(null)
// 标记设置页是否从「组件库」进入；关闭后据此回退到组件库
const settingsFromLibrary = ref(false)

onUnmounted(() => {
  if (wb.editMode) wb.editMode = false
})

const compMap: Record<CardId, Component> = {
  time: TimeCard,
  weather: WeatherCard,
  countdown: CountdownCard,
  daycount: DayCountCard,
  calendar: CalendarCard,
  todo: TodoCard,
  note: NoteCard,
  watchlist: WatchlistCard,
  tools: ToolsCard,
  bidding: BiddingCard,
  links: LinksCard,
  hotlist: HotlistCard,
  worldclock: WorldClockCard,
}

const order = computed(() => wb.visibleInstances)

useSortable(
  gridRef,
  () => ({
    handle: '.wb-cell__handle',
    animation: 220,
    onEnd: () => {
      if (!gridRef.value) return
      const ids = Array.from(gridRef.value.querySelectorAll('.wb-cell'))
        .map((el) => (el as HTMLElement).dataset.iid as string)
        .filter(Boolean)
      wb.reorderInstances(ids)
    },
  }),
  { disabled: computed(() => !wb.editMode) }
)

function openSettings(iid: string, fromLibrary = false) {
  settingsFromLibrary.value = fromLibrary
  settingsCardId.value = iid
}

// 关闭设置页：若是从「组件库」进入的，则回退到组件库页面
function onSettingsClose() {
  settingsCardId.value = null
  if (settingsFromLibrary.value) {
    wb.widgetLibraryOpen = true
    settingsFromLibrary.value = false
  }
}

// 自适应高度仅对「满宽(独占整行 w≥9) + 组件自动高度开关打开」的卡片生效（CSS 通过 .wb-cell--auto-h 实现）。
// 招标信息等「满宽但未开开关」的卡片不会带此类，严格按网格固定高度展示，互不耦合、永不互相遮挡。
function isAutoEligible(iid: string): boolean {
  const sz = wb.getInstSize(iid)
  if (sz.w < 9) return false
  return wb.getAutoHeight(iid)
}
</script>

<template>
  <div class="wb-wrap">
    <div class="wb-head">
      <div class="wb-head__top">
        <div class="wb-head__left">
          <h1 class="wb-title">工作台</h1>
          <p class="wb-sub2">个人效率一览 · 编辑模式下可拖拽排序、调整卡片尺寸</p>
        </div>
        <div class="wb-head__right">
          <QuoteBar />
          <button v-if="wb.editMode" class="btn btn-sm btn-ghost" @click="wb.resetLayout()">
            重置布局
          </button>
        </div>
      </div>
    </div>

    <div ref="gridRef" class="wb-grid">
      <div
        v-for="inst in order"
        :key="inst.iid"
        class="wb-cell"
        :class="{ 'wb-cell--edit': wb.editMode, 'wb-cell--notitle': !wb.getShowTitle(inst.iid), 'wb-cell--auto-h': isAutoEligible(inst.iid) }"
        :data-iid="inst.iid"
        :style="{ '--w': wb.getInstSize(inst.iid).w, '--h': wb.getInstSize(inst.iid).h }"
      >
        <component :is="compMap[inst.type]" :iid="inst.iid" />
        <div v-if="wb.editMode" class="wb-cell__bar">
          <button class="wb-cell__btn wb-cell__handle" title="拖拽排序" aria-label="拖拽">
            <AppIcon name="grip-vertical" :size="16" />
          </button>
          <button class="wb-cell__btn" @click="openSettings(inst.iid)" title="设置" aria-label="设置">
            <AppIcon name="settings" :size="16" />
          </button>
        </div>
      </div>
    </div>

    <WbCardSettings v-if="settingsCardId" :iid="settingsCardId" @close="onSettingsClose" />

    <WidgetLibraryModal
      :open="wb.widgetLibraryOpen"
      @close="wb.widgetLibraryOpen = false"
      @open-settings="(iid: string) => { wb.widgetLibraryOpen = false; openSettings(iid, true) }"
    />
  </div>
</template>
