<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import AppIcon from './AppIcon.vue'
import { useSortable } from '@/composables/useSortable'

const store = useDashboardStore()
const listEl = ref<HTMLElement | null>(null)

function scrollTo(id: number | string) {
  if (id === 'top') {
    const c = document.querySelector('.drawer-content')
    if (c) c.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const el = document.getElementById('sec-' + id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 侧栏分组点击：分组视图下切换当前展示分组，总览视图下滚动定位 */
function onGroupClick(id: number) {
  if (store.view === 'nav') store.setNavGroup(id)
  else scrollTo(id)
}

/** 侧栏高亮：分组视图看 navGroupId，总览视图看滚动联动的 activeSectionId */
function isActive(id: number) {
  return store.view === 'nav' ? store.navGroupId === id : store.activeSectionId === id
}

// 编辑模式下侧栏分组拖拽重排
const dragDisabled = computed(() => !store.editMode)
useSortable(
  listEl,
  () => ({
    group: 'groups',
    animation: 160,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: '.group-row',
    filter: 'button',
    onEnd: () => {
      const ids = Array.from(listEl.value?.querySelectorAll<HTMLElement>('.group-row') ?? [])
        .map((el) => Number(el.dataset.id))
        .filter((n) => Number.isFinite(n))
      if (ids.length) store.reorderGroups(ids)
    },
  }),
  { disabled: dragDisabled }
)
</script>

<template>
  <div class="drawer-side">
    <div class="side-inner">
      <aside class="side-scroll">
        <ul class="menu">
          <li class="side-section"><span class="side-title">我的分组</span></li>

          <li v-if="store.ungrouped && store.ungrouped.count > 0">
            <a
              href="javascript:void(0)"
              :class="{ 'is-active': isActive(0) }"
              @click="onGroupClick(0)"
            >
              <AppIcon name="inbox" :size="16" /> 未分组
            </a>
          </li>

          <ul id="group-list" ref="listEl" class="menu">
            <li v-for="g in store.groups" :key="g.id">
              <div
                class="group-row"
                :class="{ 'is-active': isActive(g.id) }"
                :data-id="g.id"
                :data-name="g.name"
                :data-icon="g.icon || 'folder'"
              >
                <a href="javascript:void(0)" class="group-link" @click="onGroupClick(g.id)">
                  <AppIcon :name="g.icon || 'folder'" :size="16" />
                  <span class="truncate">{{ g.name }}</span>
                </a>
                <button class="g-act" title="编辑分组" @click="store.openEditGroup(g)">
                  <AppIcon name="pencil" :size="14" />
                </button>
                <button class="g-act g-del" title="删除分组" @click="store.askDeleteGroup(g)">
                  <AppIcon name="trash-2" :size="14" />
                </button>
              </div>
            </li>
        </ul>
      </ul>
      </aside>

      <div class="side-foot">
        <button
          type="button"
          class="foot-btn"
          title="全部链接"
          aria-label="全部链接"
          @click="scrollTo('top')"
        >
          <AppIcon name="layout-grid" :size="16" />
        </button>
        <button
          type="button"
          class="foot-btn"
          title="回到顶部"
          aria-label="回到顶部"
          @click="scrollTo('top')"
        >
          <AppIcon name="arrow-up-to-line" :size="16" />
        </button>
        <button
          type="button"
          class="foot-btn"
          title="新建分组"
          aria-label="新建分组"
          @click="store.openAddGroup()"
        >
          <AppIcon name="plus" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
