<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'

export interface ChartSeries {
  name: string
  color: string
  values: number[]
}

/** 节点下方小字：风向 / 风力分行展示，风力可带小图标 */
export interface NodeSub {
  dir?: string | null
  scale?: string | null
}

const props = withDefaults(
  defineProps<{
    labels: string[]
    series: ChartSeries[]
    height?: number
    unit?: string
    yTicks?: number
    showPoints?: boolean
    showArea?: boolean
    /** 每个 x 节点下方展示的天气图标（lucide 名），长度与 labels 对齐 */
    icons?: (string | null)[]
    /** 每个 x 节点图标下的小字（如 24h 的风向/风力），长度与 labels 对齐 */
    nodeSub?: (NodeSub | null)[]
    /** 悬浮节点图标时显示的天气文字（如「晴(夜)」），长度与 labels 对齐 */
    nodeTips?: (string | null)[]
    /** 悬浮提示用的标签（默认用 labels），如 7d 传日期而非星期 */
    tipLabels?: string[]
  }>(),
  {
    height: 180,
    unit: '°',
    yTicks: 4,
    showPoints: true,
    showArea: false,
    icons: () => [],
    nodeSub: () => [],
    nodeTips: () => [],
    tipLabels: () => [],
  },
)

// 固定坐标系，靠 CSS width:100% + viewBox 等比缩放，保证文字/线条清晰不拉伸
const W = 640
// top 留出较宽内边距：悬浮提示框固定置于该带内，永不与折线数据重叠
const PAD = { left: 38, right: 14, top: 54, bottom: 26 }

const plotW = computed(() => W - PAD.left - PAD.right)
const plotH = computed(() => props.height - PAD.top - PAD.bottom)

function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  let nice = 10
  if (n <= 1) nice = 1
  else if (n <= 2) nice = 2
  else if (n <= 5) nice = 5
  return nice * pow
}

// 合并所有系列取值求 min/max，并圆整到「漂亮」边界，避免刻度出现小数怪值
const bounds = computed(() => {
  const all: number[] = []
  for (const s of props.series) for (const v of s.values) all.push(v)
  if (!all.length) return { min: 0, max: 1, step: 1 }
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const span = hi - lo
  lo -= span * 0.1
  hi += span * 0.1
  const step = niceStep((hi - lo) / props.yTicks)
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  if (hi === lo) hi = lo + step
  return { min: lo, max: hi, step }
})

const yTicksArr = computed<number[]>(() => {
  const { min, max, step } = bounds.value
  const arr: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) arr.push(Math.round(v * 100) / 100)
  return arr
})

function xAt(i: number): number {
  const n = props.labels.length
  if (n <= 1) return PAD.left + plotW.value / 2
  return PAD.left + (plotW.value * i) / (n - 1)
}
function yAt(v: number): number {
  const { min, max } = bounds.value
  const t = (v - min) / (max - min || 1)
  return PAD.top + plotH.value * (1 - t)
}

// x 轴标签抽稀：最多约 8 个，避免 24h 拥挤；节点图标行使用同一套抽稀，保证图标只出现在显示的刻度下方
const xLabelStep = computed(() => {
  const n = props.labels.length
  if (n <= 8) return 1
  return Math.ceil(n / 8)
})
const visibleXLabels = computed(() =>
  props.labels.map((lab, i) => ({
    lab,
    x: xAt(i),
    show: i % xLabelStep.value === 0 || i === props.labels.length - 1,
  })),
)

const seriesPaths = computed(() =>
  props.series.map((s) => {
    const pts = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v), v }))
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const baseY = (PAD.top + plotH.value).toFixed(1)
    const area = props.showArea
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseY} L${pts[0].x.toFixed(1)},${baseY} Z`
      : ''
    return { ...s, pts, line, area }
  }),
)

// 节点图标行：仅渲染 x 轴「显示出来的刻度」对应节点（与折线 x 位置对齐），避免每小时都挤一个图标
const nodeEls = computed(() =>
  props.labels
    .map((_, i) => ({
      i,
      left: (xAt(i) / W) * 100,
      icon: props.icons?.[i] || null,
      sub: props.nodeSub?.[i] || null,
    }))
    .filter((n) => n.i % xLabelStep.value === 0 || n.i === props.labels.length - 1),
)

// 悬浮提示（折线上的点）
const hover = ref<{ idx: number; x: number } | null>(null)
function onEnter(idx: number, x: number) {
  hover.value = { idx, x }
}
function onLeave() {
  hover.value = null
}
const tipLabel = computed(() => {
  if (!hover.value) return ''
  const arr = props.tipLabels?.length ? props.tipLabels : props.labels
  return arr[hover.value.idx] ?? ''
})
const tipLines = computed(() => {
  if (!hover.value) return []
  return props.series.map((s) => ({ name: s.name, color: s.color, value: s.values[hover.value!.idx] }))
})
const tipLeft = computed(() => (hover.value ? (hover.value.x / W) * 100 : 0))
// 悬浮提示水平方向夹紧在卡片内：左右各留 ~96px 缓冲，避免最右/最左节点溢出卡片产生横向滚动条
const tipLeftClamped = computed(
  () => `clamp(96px, ${tipLeft.value.toFixed(1)}%, calc(100% - 96px))`,
)

// 悬浮天气图标时显示文字天气
const hoverNode = ref<number | null>(null)
function nodeTipText(i: number): string | null {
  return props.nodeTips?.[i] || null
}
// 节点天气文字气泡的水平翻转：靠近右/左边缘时改为右/左对齐，避免溢出卡片
function nodeTipStyle(left: number): Record<string, string> {
  if (left > 88) return { right: '0', left: 'auto', transform: 'none' }
  if (left < 12) return { left: '0', right: 'auto', transform: 'none' }
  return { left: '50%', right: 'auto', transform: 'translateX(-50%)' }
}
function nodeTipCls(left: number): string {
  if (left > 88) return 'lc-node-tip--right'
  if (left < 12) return 'lc-node-tip--left'
  return 'lc-node-tip--center'
}

const hasData = computed(() => props.labels.length > 0 && props.series.some((s) => s.values.length > 0))
</script>

<template>
  <div class="lc">
    <svg
      v-if="hasData"
      class="lc__svg"
      :viewBox="`0 0 ${W} ${height}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="折线图"
    >
      <!-- 网格 + y 轴刻度 -->
      <g class="lc-grid">
        <line
          v-for="(t, i) in yTicksArr"
          :key="'g' + i"
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="yAt(t)"
          :y2="yAt(t)"
        />
        <text
          v-for="(t, i) in yTicksArr"
          :key="'yl' + i"
          class="lc-label"
          :x="PAD.left - 6"
          :y="yAt(t) + 3"
          text-anchor="end"
        >
          {{ Math.round(t) }}{{ unit }}
        </text>
      </g>

      <!-- x 轴标签 -->
      <g class="lc-x">
        <text
          v-for="(item, i) in visibleXLabels"
          v-show="item.show"
          :key="'xl' + i"
          class="lc-label"
          :x="item.x"
          :y="height - 8"
          text-anchor="middle"
        >
          {{ item.lab }}
        </text>
      </g>

      <!-- 系列：面积 + 折线 + 点 + 透明命中区（用于悬浮提示） -->
      <g v-for="(s, si) in seriesPaths" :key="'s' + si">
        <path v-if="s.area" :d="s.area" :fill="s.color" fill-opacity="0.12" stroke="none" />
        <path :d="s.line" fill="none" :stroke="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle
          v-for="(p, pi) in s.pts"
          v-show="showPoints"
          :key="'p' + pi"
          :cx="p.x"
          :cy="p.y"
          r="2.6"
          :fill="s.color"
        />
        <!-- 透明大命中区，降低悬浮点到点的难度 -->
        <circle
          v-for="(p, pi) in s.pts"
          :key="'hit' + pi"
          :cx="p.x"
          :cy="p.y"
          r="11"
          fill="transparent"
          style="pointer-events: all; cursor: pointer"
          @mouseenter="onEnter(pi, p.x)"
          @mouseleave="onLeave"
        />
      </g>
    </svg>

    <!-- x 节点图标行（只出现在显示的 x 刻度下方，与折线 x 位置对齐） -->
    <div v-if="hasData" class="lc-nodes">
      <div
        v-for="(n, i) in nodeEls"
        :key="'n' + i"
        class="lc-node"
        :style="{ left: n.left + '%' }"
      >
        <span
          v-if="n.icon"
          class="lc-node__icon"
          :title="nodeTipText(n.i) || ''"
          @mouseenter="hoverNode = n.i"
          @mouseleave="hoverNode = null"
        >
          <AppIcon :name="n.icon" :size="15" />
        </span>
        <span v-if="n.sub && n.sub.dir" class="lc-node__dir">{{ n.sub.dir }}</span>
        <span v-if="n.sub && n.sub.scale" class="lc-node__scale">
          <AppIcon name="wind" :size="10" />
          {{ n.sub.scale }}
        </span>
        <!-- 悬浮天气图标时显示的天气文字：出现在图标下方（不遮挡 x 轴），并按边缘翻转避免溢出 -->
        <div
          v-if="hoverNode === n.i && nodeTipText(n.i)"
          class="lc-node-tip"
          :class="nodeTipCls(n.left)"
          :style="nodeTipStyle(n.left)"
        >
          {{ nodeTipText(n.i) }}
        </div>
      </div>
    </div>

    <!-- 悬浮提示：固定在图表顶部留白带内，不遮挡折线；水平方向夹紧在卡片内 -->
    <div v-if="hover && hasData" class="lc-tip" :style="{ left: tipLeftClamped }">
      <div class="lc-tip__label">{{ tipLabel }}</div>
      <div v-for="(t, i) in tipLines" :key="'t' + i" class="lc-tip__row">
        <i class="lc-tip__dot" :style="{ background: t.color }" />
        <span>{{ t.name }}：{{ Math.round(t.value) }}{{ unit }}</span>
      </div>
    </div>

    <!-- 多系列图例 -->
    <div v-if="series.length > 1" class="lc-legend">
      <span v-for="(s, i) in series" :key="'lg' + i" class="lc-legend__item">
        <i class="lc-legend__dot" :style="{ background: s.color }" />
        {{ s.name }}
      </span>
    </div>

    <p v-if="!hasData" class="lc-empty">暂无数据</p>
  </div>
</template>

<style scoped>
.lc {
  width: 100%;
  position: relative;
}
.lc__svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.lc-grid line {
  stroke: currentColor;
  stroke-opacity: 0.12;
  stroke-width: 1;
}
.lc-label {
  fill: currentColor;
  fill-opacity: 0.55;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
/* 节点图标行：只出现在 x 轴显示的刻度下方（绝对定位百分比） */
.lc-nodes {
  position: relative;
  width: 100%;
  margin-top: 2px;
  min-height: 34px;
  /* 预留底部空间：悬浮天气文字气泡出现在图标下方，需容纳其高度，避免溢出卡片产生滚动条 */
  padding-bottom: 28px;
}
.lc-node {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.05;
  pointer-events: none;
}
.lc-node__icon {
  color: currentColor;
  opacity: 0.85;
  display: inline-flex;
  pointer-events: auto;
  cursor: help;
}
.lc-node__dir {
  font-size: 9px;
  opacity: 0.6;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lc-node__scale {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 9px;
  opacity: 0.55;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* 悬浮天气图标时的文字天气气泡：出现在图标下方，向上指向图标，不遮挡 x 轴刻度 */
.lc-node-tip {
  position: absolute;
  top: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--b1, #fff);
  color: var(--text-base, #1f2937);
  border: 1px solid hsl(var(--bc, 200) / 0.18);
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  pointer-events: none;
  z-index: 7;
}
.lc-node-tip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: var(--b1, #fff);
}
/* 边缘翻转：气泡对齐到节点右/左边缘，箭头随之偏移，避免溢出卡片 */
.lc-node-tip--right::after {
  left: auto;
  right: 7px;
  transform: none;
}
.lc-node-tip--left::after {
  left: 7px;
  right: auto;
  transform: none;
}
/* 悬浮提示：固定在图表顶部留白带，不遮挡折线数据 */
.lc-tip {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  background: var(--b1, #fff);
  color: var(--text-base, #1f2937);
  border: 1px solid hsl(var(--bc, 200) / 0.18);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 11px;
  line-height: 1.45;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  pointer-events: none;
  z-index: 5;
  white-space: nowrap;
  min-width: 84px;
}
.lc-tip__label {
  font-weight: 600;
  margin-bottom: 2px;
}
.lc-tip__row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.lc-tip__dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  display: inline-block;
}
.lc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: currentColor;
  opacity: 0.8;
}
.lc-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.lc-legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  display: inline-block;
}
.lc-empty {
  text-align: center;
  font-size: 13px;
  opacity: 0.5;
  padding: 18px 0;
}
</style>
