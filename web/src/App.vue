<script setup lang="ts">
import { onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import AppShell from '@/components/AppShell.vue'

const store = useDashboardStore()
onMounted(async () => {
  await store.init()
  // 未登录：交给 Jinja 登录页设置 session 后跳回 SPA 根
  if (!store.authed) {
    location.href = '/login'
  }
})
</script>

<template>
  <AppShell />
</template>
