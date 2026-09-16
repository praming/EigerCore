<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import AppModal from './AppModal.vue'

const store = useSettingsStore()
const ui = useUiStore()

// —— 个人资料 ——
const nickname = ref('')
const avatar = ref('')
// —— 修改密码 ——
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingProfile = ref(false)
const savingPwd = ref(false)

// 打开弹窗时回显当前资料，并清空密码字段
watch(
  () => store.profileOpen,
  (open) => {
    if (open) {
      nickname.value = store.user?.nickname ?? ''
      avatar.value = store.user?.avatar ?? ''
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    }
  },
  { immediate: true }
)

async function saveProfile() {
  savingProfile.value = true
  try {
    await store.updateProfile(nickname.value.trim(), avatar.value.trim())
  } finally {
    savingProfile.value = false
  }
}

async function changePassword() {
  if (newPassword.value.length < 6) {
    ui.pushToast('新密码至少 6 位', 'error')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ui.pushToast('两次输入的新密码不一致', 'error')
    return
  }
  savingPwd.value = true
  try {
    await store.changePassword(oldPassword.value, newPassword.value, confirmPassword.value)
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } finally {
    savingPwd.value = false
  }
}
</script>

<template>
  <AppModal :open="store.profileOpen" box-class="max-w-lg" @close="store.closeProfile()">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold">个人中心</h3>
      <button type="button" class="icon-btn" aria-label="关闭" @click="store.closeProfile()">
        <span class="text-xl leading-none">×</span>
      </button>
    </div>

    <div class="space-y-6 max-h-[70vh] overflow-y-auto px-3">
      <!-- 个人资料 -->
      <section>
        <h4 class="font-medium mb-3">个人资料</h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">
            <span>昵称</span>
            <input v-model="nickname" maxlength="80" class="input input-bordered w-full" placeholder="昵称" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>头像链接（http(s) 图片）</span>
            <input v-model="avatar" class="input input-bordered w-full" placeholder="https://…" />
          </label>
        </div>
        <div class="mt-3">
          <button type="button" class="btn btn-sm btn-primary" :disabled="savingProfile" @click="saveProfile">
            保存资料
          </button>
        </div>
      </section>

      <!-- 修改密码 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">修改密码</h4>
        <div class="space-y-3">
          <label class="flex flex-col gap-1 text-sm">
            <span>当前密码</span>
            <input v-model="oldPassword" type="password" maxlength="64" class="input input-bordered w-full" placeholder="当前密码" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>新密码（≥6 位）</span>
            <input v-model="newPassword" type="password" maxlength="64" class="input input-bordered w-full" placeholder="新密码" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>确认新密码</span>
            <input v-model="confirmPassword" type="password" maxlength="64" class="input input-bordered w-full" placeholder="再次输入新密码" />
          </label>
        </div>
        <div class="mt-3">
          <button type="button" class="btn btn-sm btn-primary" :disabled="savingPwd" @click="changePassword">
            修改密码
          </button>
        </div>
      </section>
    </div>
  </AppModal>
</template>
