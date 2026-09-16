<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { linksApi } from '@/api'
import type { LinkFormInput } from '@/types/api'
import AppModal from './AppModal.vue'
import AppIcon from './AppIcon.vue'
import ColorPicker, { type Swatch } from './ColorPicker.vue'
import IconUploader from './IconUploader.vue'
import IconPicker from './IconPicker.vue'

/**
 * 新增 / 编辑链接弹窗 —— 复刻 dashboard.html 的 #link-modal。
 * 字段、类名、默认值、URL 预填 https:// 等行为与原模板逐条对齐。
 */
const store = useDashboardStore()

/** 10 种内置柔和色（莫兰迪 / 中国传统色），顺序与色值同 dashboard.html */
const BG_PRESETS: Swatch[] = [
  { color: '#A6B5C0', title: '黛蓝灰' },
  { color: '#B7C4B1', title: '竹青灰' },
  { color: '#E3C5C5', title: '藕粉' },
  { color: '#EAD8BE', title: '杏米' },
  { color: '#C9BBD9', title: '暮山紫' },
  { color: '#B9D4DE', title: '天青' },
  { color: '#D9D0A3', title: '秋香' },
  { color: '#E0C4CE', title: '藕荷' },
  { color: '#D9B0B0', title: '灰玫' },
  { color: '#BCD0C0', title: '松绿' },
]

const TC_PRESETS: Swatch[] = [
  { color: '#000000', title: '黑色' },
  { color: '#FFFFFF', title: '白色' },
]

const title = ref('')
const url = ref('')
const note = ref('')
const groupId = ref(0)
const bgColor = ref('')
const titleColor = ref('')
const iconFile = ref<File | null>(null)
const iconName = ref('')
/** 是否要清除已上传图标（选中内置图标 / 默认时为 true，上传新图时复位） */
const clearIcon = ref(false)
const urlInput = ref<HTMLInputElement | null>(null)
const uploader = ref<InstanceType<typeof IconUploader> | null>(null)
const fetching = ref(false)

const isEdit = computed(() => store.editingLink !== null)
const heading = computed(() => (isEdit.value ? '编辑链接' : '新增链接'))
const existingIconUrl = computed(() => store.editingLink?.icon_url ?? null)

/** 打开时按 openAdd / openEdit 的规则回填表单 */
watch(
  () => store.linkModalOpen,
  (open) => {
    if (!open) return
    const link = store.editingLink
    iconFile.value = null
    clearIcon.value = false
    uploader.value?.reset()
    if (link) {
      title.value = link.title
      url.value = link.url
      note.value = link.note || ''
      groupId.value = link.group_id ?? 0
      bgColor.value = link.bg_color || ''
      titleColor.value = link.title_color || ''
      iconName.value = link.icon || ''
    } else {
      title.value = ''
      // 与 openAdd 一致：预填协议头，省去每次手输
      url.value = 'https://'
      note.value = ''
      groupId.value = store.presetGroupId
      bgColor.value = ''
      titleColor.value = ''
      iconName.value = ''
      // 打开后把光标放到 https:// 之后，方便直接粘贴 / 续写
      requestAnimationFrame(() => {
        const el = urlInput.value
        if (!el) return
        el.focus()
        try {
          el.setSelectionRange(el.value.length, el.value.length)
        } catch {
          /* 某些输入类型不支持 setSelectionRange，忽略 */
        }
      })
    }
  }
)

function fieldError(name: string): string {
  return store.formErrors[name]?.[0] || ''
}

async function onFetchTitle() {
  const u = url.value.trim()
  if (!u || u === 'https://' || u === 'http://') {
    store.pushToast('请先填写完整的 URL 再获取标题。', 'error')
    urlInput.value?.focus()
    return
  }
  fetching.value = true
  try {
    const res = await linksApi.fetchTitle(u)
    if (res.title) title.value = res.title
  } catch (e: any) {
    store.pushToast(e?.message || '获取标题失败，请手动填写。', 'error')
  } finally {
    fetching.value = false
  }
}

/** 上传新图标 → 互斥地清掉内置选择，并复位「清除已上传」标记 */
function onIconFileChange(file: File | null) {
  iconFile.value = file
  if (file) {
    iconName.value = ''
    clearIcon.value = false
  }
}

/** 选中内置图标 → 清掉上传的文件，并标记需要清除已上传图标 */
function onPickBuiltin(name: string) {
  iconName.value = name
  clearIcon.value = true
  iconFile.value = null
  uploader.value?.reset()
}

async function onSubmit() {
  const payload: LinkFormInput = {
    title: title.value,
    url: url.value,
    note: note.value,
    group_id: groupId.value,
    bg_color: bgColor.value,
    title_color: titleColor.value,
    icon_file: iconFile.value,
    icon_url_clear: clearIcon.value,
  }
  // 编辑时回传现有图标名，避免被后端重置为默认 'link'
  if (isEdit.value && iconName.value) payload.icon = iconName.value
  await store.submitLink(payload)
}
</script>

<template>
  <AppModal :open="store.linkModalOpen" @close="store.closeLinkModal()">
    <h3 class="text-lg font-bold mb-2">{{ heading }}</h3>

    <form @submit.prevent="onSubmit">
      <label class="form-control w-full my-2">
        <span class="label-text">标题</span>
        <div class="input-wrap">
          <input v-model="title" type="text" class="input input-has-append w-full" required />
          <button
            type="button"
            class="input-append"
            :class="{ 'is-loading': fetching }"
            :disabled="fetching"
            title="根据 URL 自动获取网站标题"
            @click="onFetchTitle"
          >
            <AppIcon name="download" class="w-4 h-4" />
            <span class="ia-text">获取</span>
          </button>
        </div>
        <small v-if="fieldError('title')" class="text-error">{{ fieldError('title') }}</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">URL</span>
        <input
          ref="urlInput"
          v-model="url"
          type="url"
          class="input w-full"
          placeholder="https://"
          required
        />
        <small v-if="fieldError('url')" class="text-error">{{ fieldError('url') }}</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">图标（上传图片，支持 JPG / PNG / SVG）</span>
        <IconUploader
          ref="uploader"
          :existing-url="existingIconUrl"
          @change="onIconFileChange"
        />
        <small class="text-muted">不选择则使用默认图标；SVG 会自动净化以防安全风险。</small>
        <!-- 内置图标选择器：作为上传之外的轻量备选项（仅存图标名，复用现有 icon 契约） -->
        <IconPicker v-model="iconName" @change="onPickBuiltin" />
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">备注（选填，显示在标题下方）</span>
        <input
          v-model="note"
          type="text"
          class="input w-full"
          placeholder="如：常用文档 / 内部系统"
        />
        <small v-if="fieldError('note')" class="text-error">{{ fieldError('note') }}</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">卡片背景色（柔和色系，可选自定义）</span>
        <ColorPicker
          v-model="bgColor"
          :presets="BG_PRESETS"
          default-title="默认"
          custom-title="自定义颜色"
          custom-label="自定义背景色"
        />
        <small class="text-muted">不选择则使用默认卡片背景。</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">标题文字颜色</span>
        <ColorPicker
          v-model="titleColor"
          :presets="TC_PRESETS"
          uppercase
          default-title="默认（跟随主题）"
          custom-title="自定义文字颜色"
          custom-label="自定义标题颜色"
        />
        <small class="text-muted"
          >深色背景建议选白色，浅色背景建议选黑色，以保证对比度可读性。</small
        >
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">分组</span>
        <select v-model.number="groupId" class="select w-full">
          <option v-for="o in store.groupOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </label>

      <div class="modal-action">
        <button type="button" class="btn" @click="store.closeLinkModal()">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="store.saving">保存</button>
      </div>
    </form>
  </AppModal>
</template>
