<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { CardStyle, GroupFormInput, TitleFontSize } from '@/types/api'
import AppModal from './AppModal.vue'
import WbSwitch from './WbSwitch.vue'
import WbSelect from './WbSelect.vue'

/**
 * 新建 / 编辑分组弹窗 —— 复刻 dashboard.html 的 #group-modal。
 *
 * 关键行为对齐 refreshGroupCols / openAddGroup / openEditGroup：
 *  - 列数下拉范围随卡片样式变化（横排 1~8，矩形 1~24），标签带区间提示；
 *  - 切换样式时列数重置为该样式默认值（横排 4 / 矩形 12）；
 *  - 分组视图与总览视图列数互相独立；
 *  - 编辑态回显时，矩形样式读 links_per_row_rect(_overview)，横排读 links_per_row(_overview)，
 *    总览值缺省时回退到导航值。
 */
const store = useDashboardStore()

const FS_OPTIONS: { value: TitleFontSize; label: string }[] = [
  { value: '10px', label: '特小（10px）' },
  { value: '12px', label: '较小（12px）' },
  { value: 'sm', label: '小（13px）' },
  { value: 'base', label: '中（16px）' },
  { value: 'lg', label: '大（18px）' },
  { value: 'xl', label: '特大（21px）' },
  { value: '2xl', label: '超大（26px）' },
]

const MAXLEN_OPTIONS = [
  { value: 0, label: '不限制' },
  { value: 6, label: '6 字' },
  { value: 8, label: '8 字' },
  { value: 10, label: '10 字' },
  { value: 12, label: '12 字' },
  { value: 16, label: '16 字' },
  { value: 20, label: '20 字' },
]

const cardStyleOptions: { value: CardStyle; label: string }[] = [
  { value: 'card', label: '横排卡片（图标在左，标题 / 备注在右）' },
  { value: 'link', label: '矩形卡片（图标方块在上、标题在下，悬停显示备注）' },
]

// 列数下拉选项（分组视图 / 总览视图共用）：随卡片样式动态变化
const colsOpt = computed(() => colsOptions.value.map((n) => ({ value: n, label: `${n} 个 / 行` })))

function onCardStyleChange(v: string | number) {
  cardStyle.value = v as CardStyle
  onStyleChange()
}

const name = ref('')
const icon = ref('')
const cardStyle = ref<CardStyle>('card')
const colsNav = ref(4)
const colsOv = ref(4)
const fs = ref<TitleFontSize>('base')
const maxLen = ref(0)
const showTitle = ref(true)
const rowGap = ref(16)
const colGap = ref(16)
const dockScale = ref(1.4)

const isEdit = computed(() => store.editingGroup !== null)
const heading = computed(() => (isEdit.value ? '编辑分组' : '新建分组'))

const isRect = computed(() => cardStyle.value === 'link')
const maxCols = computed(() => (isRect.value ? 24 : 8))
const colsOptions = computed(() =>
  Array.from({ length: maxCols.value }, (_, i) => i + 1)
)
const colsSuffix = computed(() =>
  isRect.value ? '（正方形方块，1~24）' : '（横排卡片，1~8）'
)

/** 切换卡片样式：按该样式默认列数重填（与 refreshGroupColsFromStyle 一致） */
function onStyleChange() {
  const def = isRect.value ? 12 : 4
  colsNav.value = def
  colsOv.value = def
}

/** 把候选值钳制进当前样式的合法区间，越界则回退默认（同 refreshGroupCols） */
function clampCols(v: number, max: number, def: number) {
  return v >= 1 && v <= max ? v : def
}

watch(
  () => store.groupModalOpen,
  (open) => {
    if (!open) return
    const g = store.editingGroup
    if (!g) {
      name.value = ''
      icon.value = ''
      cardStyle.value = 'card'
      colsNav.value = 4
      colsOv.value = 4
      fs.value = 'base'
      maxLen.value = 0
      showTitle.value = true
      rowGap.value = 16
      colGap.value = 16
      dockScale.value = 1.4
      return
    }
    name.value = g.name
    icon.value = g.icon || ''
    const style = (g.card_style || 'card') as CardStyle
    cardStyle.value = style
    const rect = style === 'link'
    const max = rect ? 24 : 8
    const def = rect ? 12 : 4
    const nav = rect ? g.links_per_row_rect ?? 12 : g.links_per_row ?? 4
    // 总览列数缺省时回退到分组视图的值
    const ov = rect
      ? g.links_per_row_rect_overview ?? g.links_per_row_rect ?? 12
      : g.links_per_row_overview ?? g.links_per_row ?? 4
    colsNav.value = clampCols(nav, max, def)
    colsOv.value = clampCols(ov, max, def)
    fs.value = g.title_font_size || 'base'
    maxLen.value = g.title_max_len ?? 0
    showTitle.value = !!g.show_title
    rowGap.value = g.row_gap ?? 16
    colGap.value = g.col_gap ?? 16
    dockScale.value = g.dock_scale ?? 1.4
  }
)

function fieldError(field: string): string {
  return store.formErrors[field]?.[0] || ''
}

async function onSubmit() {
  const payload: GroupFormInput = {
    name: name.value,
    icon: icon.value,
    card_style: cardStyle.value,
    g_cols: colsNav.value,
    g_cols_ov: colsOv.value,
    g_fs: fs.value,
    g_maxlen: maxLen.value,
    g_show_title: showTitle.value,
    g_row_gap: rowGap.value,
    g_col_gap: colGap.value,
    g_dock_scale: dockScale.value,
  }
  await store.submitGroup(payload)
}
</script>

<template>
  <AppModal :open="store.groupModalOpen" @close="store.closeGroupModal()">
    <h3 class="text-lg font-bold mb-2">{{ heading }}</h3>

    <form @submit.prevent="onSubmit">
      <label class="form-control w-full my-2">
        <span class="label-text">分组名称</span>
        <input v-model="name" type="text" class="input w-full" required />
        <small v-if="fieldError('name')" class="text-error">{{ fieldError('name') }}</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">图标（Lucide 图标名，如 folder / briefcase / star）</span>
        <input v-model="icon" type="text" class="input w-full" placeholder="folder" />
        <small v-if="fieldError('icon')" class="text-error">{{ fieldError('icon') }}</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">卡片样式（该分组下链接的展示方式）</span>
        <WbSelect :model-value="cardStyle" :options="cardStyleOptions" @update:modelValue="onCardStyleChange" class="w-full" />
        <small class="text-muted">背景色、标题颜色等卡片设置项不受样式影响，两种样式通用。</small>
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">分组视图每行显示数量{{ colsSuffix }}</span>
        <WbSelect :model-value="colsNav" :options="colsOpt" @update:model-value="(v) => (colsNav = v as number)" class="w-full" />
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">总览视图每行显示数量{{ colsSuffix }}</span>
        <WbSelect :model-value="colsOv" :options="colsOpt" @update:model-value="(v) => (colsOv = v as number)" class="w-full" />
        <small class="text-muted"
          >总览视图（单页展示全部分组）可单独设置每行数量，与上方分组视图互不干扰。</small
        >
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">标题字号</span>
        <WbSelect v-model="fs" :options="FS_OPTIONS" class="w-full" />
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">标题最大字符数（超出截断，0 为不限制）</span>
        <WbSelect :model-value="maxLen" :options="MAXLEN_OPTIONS" @update:model-value="(v) => (maxLen = v as number)" class="w-full" />
      </label>

      <div class="flex items-center justify-between my-2 px-1">
        <span class="label-text">显示标题（关闭后卡片仅显示图标）</span>
        <WbSwitch v-model="showTitle" />
      </div>

      <label class="form-control w-full my-2">
        <span class="label-text">行间距：<b>{{ rowGap }}</b> px</span>
        <input
          v-model.number="rowGap"
          type="range"
          min="0"
          max="48"
          step="2"
          class="range range-primary"
        />
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">列间距：<b>{{ colGap }}</b> px</span>
        <input
          v-model.number="colGap"
          type="range"
          min="0"
          max="48"
          step="2"
          class="range range-primary"
        />
      </label>

      <label class="form-control w-full my-2">
        <span class="label-text">Dock 放大倍数：<b>{{ dockScale.toFixed(2) }}</b> ×</span>
        <input
          v-model.number="dockScale"
          type="range"
          min="1"
          max="2.5"
          step="0.05"
          class="range range-primary"
        />
      </label>

      <div class="modal-action">
        <button type="button" class="btn" @click="store.closeGroupModal()">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="store.saving">保存</button>
      </div>
    </form>
  </AppModal>
</template>
