<script setup lang="ts">
import { useDashboardStore } from '@/stores/dashboard'
import AppIcon from './AppIcon.vue'

const store = useDashboardStore()
</script>

<template>
  <div class="cat-switch" role="group" aria-label="分类切换">
    <button
      v-for="cat in store.categories"
      :key="cat.id"
      type="button"
      class="cat-btn"
      :class="{ 'is-active': cat.id === store.currentCategory, 'is-disabled': !cat.enabled }"
      :title="cat.name"
      :aria-pressed="cat.id === store.currentCategory"
      :disabled="!cat.enabled"
      @click="cat.enabled && store.setCategory(cat.id)"
    >
      <AppIcon :name="cat.icon" :size="18" />
      <span class="hidden md:inline">{{ cat.name }}</span>
    </button>
  </div>
</template>
