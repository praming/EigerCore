<script setup lang="ts">
import { ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import AppIcon from './AppIcon.vue'
import WbSelect from './WbSelect.vue'

const store = useDashboardStore()
const moveTarget = ref<number | ''>('')

function selectAll() {
  store.setSelection(store.visibleLinkIds)
}
function onMove(v: string | number) {
  if (v === '' || v == null) {
    moveTarget.value = ''
    return
  }
  moveTarget.value = Number(v)
  store.batchMove(Number(v))
  moveTarget.value = ''
}
function onDelete() {
  store.batchDelete()
}
function cancel() {
  store.clearSelection()
  moveTarget.value = ''
}
</script>

<template>
  <div class="batch-bar is-open" role="toolbar" aria-label="批量操作">
    <span class="batch-info">已选 <b>{{ store.selectedCount }}</b> 项</span>

    <button type="button" class="btn btn-sm" @click="selectAll">
      <AppIcon name="check-check" class="w-4 h-4" /> 全选
    </button>

    <div class="batch-move">
      <WbSelect
        :model-value="moveTarget"
        :options="store.groupOptions"
        placeholder="移动到…"
        :disabled="store.groupOptions.length === 0"
        @update:modelValue="onMove"
        class="select-sm"
      />
    </div>

    <button type="button" class="btn btn-sm btn-error" @click="onDelete">
      <AppIcon name="trash-2" class="w-4 h-4" /> 删除
    </button>

    <button type="button" class="btn btn-sm btn-ghost" @click="cancel">取消</button>
  </div>
</template>
