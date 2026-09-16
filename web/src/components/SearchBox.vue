<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import AppIcon from './AppIcon.vue'

const store = useDashboardStore()
const q = ref(store.search)
watch(q, (v) => store.setSearch(v))
</script>

<template>
  <div class="nav-search hidden sm:flex">
    <AppIcon name="search" class="ns-icon" :size="18" />
    <input v-model="q" type="search" placeholder="搜索链接名称或地址…" aria-label="搜索链接" />
  </div>
</template>
