<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import AppModal from './AppModal.vue'
import AppIcon from './AppIcon.vue'

/**
 * 删除二次确认弹窗 —— 合并 dashboard.html 的 #delete-modal 与 #delete-group-modal。
 * 两者结构一致，仅标题与说明文案不同，因此按 deleteTarget.kind 分支渲染。
 */
const store = useDashboardStore()

const isGroup = computed(() => store.deleteTarget?.kind === 'group')
const heading = computed(() => (isGroup.value ? '确认删除分组' : '确认删除'))
</script>

<template>
  <AppModal :open="store.deleteTarget !== null" @close="store.closeDelete()">
    <h3 class="text-lg font-bold flex items-center gap-2">
      <AppIcon name="alert-triangle" class="w-5 h-5 text-error" /> {{ heading }}
    </h3>

    <p v-if="isGroup" class="py-4 text-muted">
      确定删除分组「<span class="font-bold">{{ store.deleteTarget?.name }}</span
      >」吗？ 其下链接将移至「未分组」，不会被删除。
    </p>
    <p v-else class="py-4 text-muted">确定要删除该链接吗？此操作不可撤销。</p>

    <div class="modal-action">
      <button type="button" class="btn" @click="store.closeDelete()">取消</button>
      <button
        type="button"
        class="btn btn-error"
        :disabled="store.saving"
        @click="store.confirmDelete()"
      >
        确认删除
      </button>
    </div>
  </AppModal>
</template>
