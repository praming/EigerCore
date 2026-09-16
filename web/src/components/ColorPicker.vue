<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

export interface Swatch {
  color: string
  title: string
}

/**
 * 色板选择器，复刻 dashboard.html 的 #bg-picker / #tc-picker。
 *
 * 选中判定与 setBgPicker/setTcPicker 一致：
 *  - 命中预设色 → 该色块 .selected；
 *  - 有值但不在预设内 → 自定义取色器 .selected（表示走了 <input type=color>）；
 *  - 空值 → 「默认」色块 .selected。
 * uppercase 用于标题色（Jinja 侧 setTcPicker 会把值转大写后再比对）。
 */
const props = defineProps<{
  modelValue: string
  presets: Swatch[]
  defaultTitle: string
  customTitle: string
  customLabel: string
  uppercase?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const normalized = computed(() =>
  props.uppercase ? (props.modelValue || '').toUpperCase() : props.modelValue || ''
)

function isSelected(color: string) {
  const c = props.uppercase ? color.toUpperCase() : color
  return c === normalized.value
}

/** 是否命中任一预设色（含「默认」空值项） */
const inPreset = computed(
  () => normalized.value === '' || props.presets.some((p) => isSelected(p.color))
)

const customSelected = computed(() => !!normalized.value && !inPreset.value)

function pick(color: string) {
  emit('update:modelValue', props.uppercase ? color.toUpperCase() : color)
}
</script>

<template>
  <div class="bg-picker">
    <button
      type="button"
      class="bg-swatch is-default"
      :class="{ selected: normalized === '' }"
      data-color=""
      :title="defaultTitle"
      @click="pick('')"
    >
      <AppIcon name="ban" class="w-4 h-4" />
    </button>

    <button
      v-for="p in presets"
      :key="p.color"
      type="button"
      class="bg-swatch"
      :class="{ selected: isSelected(p.color) }"
      :data-color="p.color"
      :style="{ background: p.color }"
      :title="p.title"
      @click="pick(p.color)"
    ></button>

    <label class="bg-swatch bg-custom" :class="{ selected: customSelected }" :title="customTitle">
      <AppIcon name="plus" class="bc-ic" />
      <input
        type="color"
        class="bc-input"
        :aria-label="customLabel"
        :value="normalized || '#000000'"
        @change="pick(($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>
