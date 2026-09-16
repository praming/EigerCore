<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 图标上传控件，复刻 dashboard.html 的 #icon-uploader + #icon-preview。
 *
 * 预览策略与 onIconFileChange / openEdit 一致：
 *  - 本次选了文件 → URL.createObjectURL 本地 blob 预览（无 XSS 风险）；
 *  - 未选文件但已有上传图标 → 展示现有图标并提示「重新上传可替换」；
 *  - 两者都无 → 提示使用默认图标。
 * .has-file 类同样按「有文件或有现存图标」切换。
 */
const props = defineProps<{
  /** 已保存的上传图标 URL（编辑态回显用） */
  existingUrl?: string | null
}>()

const emit = defineEmits<{ (e: 'change', file: File | null): void }>()

const input = ref<HTMLInputElement | null>(null)
const picked = ref<File | null>(null)
const previewUrl = ref<string>('')

function revoke() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function onChange() {
  const files = input.value?.files
  revoke()
  if (files && files.length) {
    picked.value = files[0]
    previewUrl.value = URL.createObjectURL(files[0])
  } else {
    picked.value = null
  }
  emit('change', picked.value)
}

/** 外部重置（弹窗重新打开时调用），清空原生 input 与本地预览 */
function reset() {
  revoke()
  picked.value = null
  if (input.value) input.value.value = ''
  emit('change', null)
}
defineExpose({ reset })

// 切换编辑对象时同步清理上一次选择，避免把 A 的文件带到 B
watch(
  () => props.existingUrl,
  () => reset()
)

const hasFile = computed(() => !!picked.value || !!props.existingUrl)
</script>

<template>
  <div class="uploader" :class="{ 'has-file': hasFile }">
    <input
      ref="input"
      type="file"
      name="icon_file"
      accept="image/png,image/jpeg,image/svg+xml"
      class="uploader-input"
      @change="onChange"
    />
    <div class="uploader-inner">
      <span class="uploader-icon"><AppIcon name="image-plus" /></span>
      <span class="uploader-text">点击或拖拽上传图标</span>
      <span class="uploader-hint">支持 JPG / PNG / SVG，建议 1:1 正方形</span>
    </div>
  </div>

  <div class="mt-2 icon-preview">
    <template v-if="picked">
      <img :src="previewUrl" alt="" class="icon-prev-img" />
      <span class="text-muted">{{ picked.name || '已选择图标' }}</span>
    </template>
    <template v-else-if="existingUrl">
      <img :src="existingUrl" alt="" class="icon-prev-img" />
      <span class="text-muted">当前图标（重新上传可替换）</span>
    </template>
    <span v-else class="text-muted">当前使用默认图标</span>
  </div>
</template>
