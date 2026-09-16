<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useWorkbenchStore } from '@/stores/workbench'

const props = defineProps<{ title?: string; icon?: string; iid?: string }>()
const wb = useWorkbenchStore()
// 优先用实例标题（支持在【组件库】内联编辑后的标题），缺省回退到字面 title
const resolvedTitle = computed(() => {
  if (props.iid) {
    const inst = wb.getInst(props.iid)
    if (inst) return wb.widgetTitle(inst)
  }
  return props.title ?? ''
})
</script>

<template>
  <section class="wb-card">
    <header class="wb-card__head">
      <span class="wb-card__hgroup">
        <span v-if="icon" class="wb-card__icon"><AppIcon :name="icon" :size="18" /></span>
        <h3 v-if="!$slots.title" class="wb-card__title">{{ resolvedTitle }}</h3>
        <slot v-else name="title" />
      </span>
      <span class="wb-card__right">
        <slot name="meta" />
        <slot name="actions" />
      </span>
    </header>
    <div class="wb-card__body">
      <slot />
    </div>
  </section>
</template>
