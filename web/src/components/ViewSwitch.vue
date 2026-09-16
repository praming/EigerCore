<script setup lang="ts">
import { useDashboardStore } from '@/stores/dashboard'
import AppIcon from './AppIcon.vue'

const store = useDashboardStore()
</script>

<template>
  <div class="view-switch" role="group" aria-label="视图模式">
    <button
      type="button"
      class="icon-btn"
      :class="{ 'is-active': store.view === 'nav' }"
      title="分组视图"
      aria-label="分组视图"
      @click="store.setView('nav')"
    >
      <AppIcon name="compass" :size="18" />
    </button>
    <button
      type="button"
      class="icon-btn"
      :class="{ 'is-active': store.view === 'overview' }"
      title="总览视图"
      aria-label="总览视图"
      @click="store.setView('overview')"
    >
      <AppIcon name="layers" :size="18" />
    </button>
  </div>
</template>
