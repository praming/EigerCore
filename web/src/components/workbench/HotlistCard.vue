<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import AppTip from '../AppTip.vue'
import { useWorkbenchStore, HOTLIST_SRCS, type HotlistSource } from '@/stores/workbench'
import { workbenchApi, type HotlistItem } from '@/api/workbench'
import { hotlistLogo } from '@/assets/hotlist'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const hcfg = computed(() => wb.instConfig(props.iid) || {})
const prefs = computed(() => hcfg.value)
// 组件自动高度开关（仅本卡片满宽且本开关打开时生效；由 WorkbenchView 的 grid-template-rows 控制 auto 行）
const autoHeightHotlist = computed(() => !!wb.getAutoHeight(props.iid))

interface Board {
  items: HotlistItem[]
  source: string
  error?: string
  loading: boolean
  stale?: boolean
}

// 各平台榜单数据；columns 布局下全量展示，tabs 布局下只用 activeSrc 那一项
const boards = ref<Record<string, Board>>({})
const refreshing = ref(false)

// 已勾选的平台（按用户在设置页拖拽/勾选的顺序，而非白名单固定顺序）
const selected = computed<HotlistSource[]>(() =>
  prefs.value.platforms.filter((p) => HOTLIST_SRCS.some((s) => s.value === p)),
)

const srcLabel = (src: string) => HOTLIST_SRCS.find((s) => s.value === src)?.label || src

// tabs 布局：当前激活平台
const activeSrc = ref<HotlistSource>(selected.value[0] || 'weibo')
// 激活平台若被取消勾选，回落到第一个已选
watch(selected, (sel) => {
  if (!sel.includes(activeSrc.value)) activeSrc.value = sel[0] || 'weibo'
})

function boardOf(src: string): Board {
  return boards.value[src] ?? { items: [], source: '', error: undefined, loading: false }
}

async function fetchOne(src: HotlistSource) {
  const b: Board = boards.value[src] ?? { items: [], source: '', loading: false, error: undefined }
  b.loading = true
  b.error = undefined
  boards.value[src] = b
  try {
    const resp = await workbenchApi.hotlist(
      src,
      prefs.value.limit,
      prefs.value.provider,
      prefs.value.interval,
      prefs.value.uapisKey,
    )
    if (resp.source === 'error') {
      // 双源皆失败：保留旧列表（若有），并提示；不显示空列表
      b.error = resp.message || '暂时加载失败'
    } else {
      b.items = resp.items || []
      b.source = resp.source
      b.error = undefined
      b.stale = resp.stale || false
    }
  } catch {
    b.error = '网络异常，请稍后重试'
  } finally {
    b.loading = false
    boards.value[src] = { ...b }
  }
}

async function load() {
  const sel = selected.value
  if (!sel.length) return
  refreshing.value = true
  try {
    if (prefs.value.layout === 'columns') {
      await Promise.all(sel.map(fetchOne))
    } else {
      if (!sel.includes(activeSrc.value)) activeSrc.value = sel[0]
      await fetchOne(activeSrc.value)
    }
    // 标记「本组件请求数据源并更新榜单」的时刻——用于右上角「更新于」；
    // 取的是组件侧请求完成的时刻，而非上游真实的抓取时刻，也不展示数据源。
    if (Object.values(boards.value).some((b) => (b.items?.length ?? 0) > 0)) {
      lastUpdated.value = Date.now()
    }
  } finally {
    refreshing.value = false
    // 数据就绪后按内容自然高度反推卡片行数（自适应高度开启时）
    await nextTick()
    fitHeight()
  }
}

// 平台 / 条数 / 数据源 / 布局变化 → 立即重新拉取
watch(
  () =>
    [
      prefs.value.platforms.join(','),
      prefs.value.limit,
      prefs.value.provider,
      prefs.value.layout,
    ].join('|'),
  () => load(),
)
// tabs 布局下切换激活平台 → 拉取该平台
watch(activeSrc, () => {
  if (prefs.value.layout === 'tabs') void load()
})

// —— 间隔自动刷新 ——
let timerId: ReturnType<typeof setInterval> | null = null
let stopAutoWatch: (() => void) | null = null

function stopAuto() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function startAuto() {
  stopAuto()
  const cfg = prefs.value
  if (!cfg.autoRefresh || !cfg.interval) return
  timerId = window.setInterval(() => {
    void load()
  }, cfg.interval * 1000)
}

onMounted(() => {
  void load()
  startAuto()
  stopAutoWatch = watch(prefs, () => startAuto(), { deep: true })
  // 自适应高度：宽度变化重算 + 开关切换即时重算
  if (typeof ResizeObserver !== 'undefined' && listRoot.value) {
    ro = new ResizeObserver(onResize)
    ro.observe(listRoot.value)
  }
  watch(
    () => autoHeightHotlist.value,
    () => {
      // 关闭时 fitHeight 会清除内联高度并恢复填满单元格；开启时按内容重算
      nextTick(fitHeight)
    },
  )
})

onUnmounted(() => {
  stopAuto()
  if (stopAutoWatch) stopAutoWatch()
  if (ro) {
    ro.disconnect()
    ro = null
  }
})

function onRowClick(url: string) {
  if (url) window.open(url, '_blank', 'noopener')
}

// 展示用视图：tabs=激活平台单栏；columns=已选平台各一列
const viewBoards = computed(() =>
  prefs.value.layout === 'columns'
    ? selected.value.map((s) => ({ src: s, label: srcLabel(s), ...boardOf(s) }))
    : [{ src: activeSrc.value, label: srcLabel(activeSrc.value), ...boardOf(activeSrc.value) }],
)

// 是否有任一板块是「上游不可用、回退的缓存数据」（用于在顶部提示可能已过时）
const anyStale = computed(() => viewBoards.value.some((v) => v.stale))

// 本组件「请求数据源并更新榜单」的时刻（组件侧请求完成的时刻，非上游抓取时刻）。
// 右上角仅展示此时间，不再展示数据源。
const lastUpdated = ref<number | null>(null)
const lastSync = computed(() =>
  lastUpdated.value
    ? new Date(lastUpdated.value).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

// —— 自适应高度 ——
// 网格行高下限 150px、可增长（input.css .wb-grid 的 grid-auto-rows: minmax(150px,auto)）。
// 非自适应卡片由 .wb-cell 固定高度 + overflow:hidden 裁剪到网格轨道，绝不越界；
// 仅「满宽 + 组件自动高度开关打开」的卡片带 .wb-cell--auto-h（单行、随内容增长、不裁剪），
// 因其独占整行带，增长只会把下方行带整体下推、不会压住任何卡片。
// 故自适应开启时这里无需改尺寸——完全交给 CSS；固定模式才按内容反推整数行避免被裁剪。
const listRoot = ref<HTMLElement | null>(null)
const ROW_PX = 150
const ROW_GAP = 16
const HOTLIST_MIN_H = 2
const HOTLIST_MAX_H = 6

let ro: ResizeObserver | null = null
let lastWidth = 0

function measureNatural(root: HTMLElement, card: HTMLElement): number {
  const head = card.querySelector('.wb-card__head') as HTMLElement | null
  const cs = getComputedStyle(card)
  const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const borderV = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  const headH = head
    ? head.getBoundingClientRect().height + parseFloat(getComputedStyle(head).marginBottom || '0')
    : 0
  return headH + padV + borderV + root.scrollHeight
}

function fitHeight() {
  const root = listRoot.value
  const card = root?.closest('.wb-card') as HTMLElement | null
  if (!card) return
  // 始终清除内联高度/对齐，避免旧值干扰 CSS 的自动/固定行高。
  card.style.height = ''
  card.style.alignSelf = ''
  if (autoHeightHotlist.value) {
    // 自适应开启：完全交由 CSS（.wb-cell--auto-h 单行随内容增长），无需 JS 干预。
    return
  }
  // 固定高度模式：按内容自然高度反推整数行数作为卡片固定高度（避免被 .wb-cell 裁剪）。
  const savedH = card.style.height
  card.style.height = 'auto'
  const natural = measureNatural(root, card)
  card.style.height = savedH
  let h = Math.ceil((natural + ROW_GAP) / (ROW_PX + ROW_GAP))
  h = Math.max(HOTLIST_MIN_H, Math.min(HOTLIST_MAX_H, h))
  const cur = wb.getInstSize(props.iid)
  if (h !== cur.h) wb.setInstSize(props.iid, cur.w, h)
}

// 卡片宽度变化（分栏布局换列数会改列表高度）→ 重新适配；仅响应宽度避免高度自触发死循环
function onResize(entries: ResizeObserverEntry[]) {
  const w = entries[0]?.contentRect.width ?? 0
  if (w && w !== lastWidth) {
    lastWidth = w
    fitHeight()
  }
}
</script>

<template>
  <WbCard :iid="iid" icon="flame">
    <template #meta>
      <span v-if="anyStale" class="wb-hotlist__stale" title="上游数据源暂不可用，当前展示的是最近一次成功缓存，可能已过时">缓存</span>
      <span v-if="lastSync" class="wb-hotlist__sync">更新于 {{ lastSync }}</span>
      <button
        class="wb-hotlist__refresh"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? '刷新中…' : '刷新热搜'"
        @click="load"
      >
        <AppIcon name="refresh-cw" :size="13" :class="{ spin: refreshing }" />
      </button>
    </template>

    <div ref="listRoot" class="wb-hotlist" :class="['is-' + prefs.layout, { 'is-adaptive': autoHeightHotlist }]">
      <!-- tabs 布局：顶部平台切换（只展示已选平台，避免全量 20 个平台换行垫高卡片） -->
      <div v-if="prefs.layout === 'tabs'" class="wb-hotlist__tabs">
          <button
          v-for="s in selected"
          :key="s"
          type="button"
          class="wb-hotlist__tab"
          :class="{ 'is-active': activeSrc === s }"
          @click="activeSrc = s"
        >
          <img v-if="hotlistLogo(s)" :src="hotlistLogo(s)" :alt="srcLabel(s)" class="wb-logo wb-hotlist__tab-logo" />
          {{ srcLabel(s) }}
        </button>
      </div>

      <!-- columns 布局：各平台单列并排，无需切换 -->
      <div v-if="prefs.layout === 'columns'" class="wb-hotlist__cols">
        <div v-for="vb in viewBoards" :key="vb.src" class="wb-hotlist__col">
          <div class="wb-hotlist__col-head">
            <img v-if="hotlistLogo(vb.src)" :src="hotlistLogo(vb.src)" :alt="vb.label" class="wb-logo wb-hotlist__col-logo" />
            <span class="wb-hotlist__col-name">{{ vb.label }}</span>
            <span v-if="vb.source" class="wb-hotlist__src" :title="'数据来源'">{{ vb.source }}</span>
          </div>

          <div v-if="vb.error && vb.items.length === 0" class="wb-hotlist__error">
            <AppIcon name="wifi-off" :size="14" />
            <span>{{ vb.error }}</span>
            <button type="button" class="wb-hotlist__retry" @click="fetchOne(vb.src as HotlistSource)">重试</button>
          </div>

          <div class="wb-hotlist__col-body">
            <a
              v-for="(it, i) in vb.items"
              :key="i"
              class="wb-hotlist__item"
              :href="it.url || undefined"
              target="_blank"
              rel="noopener"
              @click="onRowClick(it.url)"
            >
              <span class="wb-hotlist__rank" :class="'is-' + (i + 1)">{{ i + 1 }}</span>
              <AppTip :text="it.title" class="wb-hotlist__title">{{ it.title }}</AppTip>
              <span v-if="it.label" class="wb-hotlist__tag">{{ it.label }}</span>
              <span v-if="it.heat" class="wb-hotlist__heat">{{ it.heat }}</span>
            </a>
            <div
              v-if="vb.items.length === 0 && !vb.loading && !vb.error"
              class="wb-muted wb-hotlist__empty"
            >
              暂无数据
            </div>
          </div>
        </div>
      </div>

      <!-- tabs 布局：单栏列表 -->
      <div v-else class="wb-hotlist__list">
        <div v-if="viewBoards[0].error && viewBoards[0].items.length === 0" class="wb-hotlist__error">
          <AppIcon name="wifi-off" :size="16" />
          <span>{{ viewBoards[0].error }}</span>
          <button type="button" class="wb-hotlist__retry" @click="load">重试</button>
        </div>

        <a
          v-for="(it, i) in viewBoards[0].items"
          :key="i"
          class="wb-hotlist__item"
          :href="it.url || undefined"
          target="_blank"
          rel="noopener"
          @click="onRowClick(it.url)"
        >
          <span class="wb-hotlist__rank" :class="'is-' + (i + 1)">{{ i + 1 }}</span>
          <AppTip :text="it.title" class="wb-hotlist__title">{{ it.title }}</AppTip>
          <span v-if="it.label" class="wb-hotlist__tag">{{ it.label }}</span>
          <span v-if="it.heat" class="wb-hotlist__heat">{{ it.heat }}</span>
        </a>
        <div
          v-if="viewBoards[0].items.length === 0 && !viewBoards[0].loading && !viewBoards[0].error"
          class="wb-muted wb-hotlist__empty"
        >
          暂无数据
        </div>
      </div>
    </div>
  </WbCard>
</template>
