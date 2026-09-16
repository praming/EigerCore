import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * macOS 风格 Dock 邻近放大：
 * 根据指针与各卡片中心的距离，逐卡写入 CSS 变量 --dock-scale，
 * 由既有 .link-card { transform: scale(var(--dock-scale, 1)) } 即时反映（.nav-grid 下
 * transform 不被过渡，故放大跟手）。
 *
 * - 仅在非编辑模式生效（opts.disabled = store.editMode）
 * - 拖拽中（存在 .sortable-drag）跳过，避免与 Sortable 内联 transform 冲突
 * - 用 requestAnimationFrame 节流 pointermove
 */
export function useDock(
  target: Ref<HTMLElement | null>,
  getMax: () => number,
  opts: { disabled?: Ref<boolean> } = {}
) {
  let raf = 0
  let lastEvent: PointerEvent | null = null
  let bound = false

  function apply() {
    raf = 0
    const grid = target.value
    const ev = lastEvent
    if (!grid || !ev) return
    if (grid.querySelector('.sortable-drag')) {
      reset()
      return
    }
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.link-card'))
    if (cards.length === 0) return
    const cardW = cards[0].getBoundingClientRect().width || 100
    const cardH = cards[0].getBoundingClientRect().height || 100
    // 仅以「悬停卡 + 最近邻」为影响范围：半径取卡片较大边 ×1.5，避免整片区域都被放大
    const range = Math.max(cardW, cardH) * 1.5
    const max = getMax()
    for (const card of cards) {
      const r = card.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy)
      if (dist >= range) {
        card.style.setProperty('--dock-scale', '1')
        continue
      }
      // 二次方衰减：远端迅速回落到 1，只有悬停卡明显放大、相邻卡轻微跟随
      const falloff = 1 - dist / range
      const scale = 1 + (max - 1) * falloff * falloff
      card.style.setProperty('--dock-scale', scale.toFixed(3))
    }
  }

  function onMove(e: PointerEvent) {
    lastEvent = e
    if (!raf) raf = requestAnimationFrame(apply)
  }

  function reset() {
    const grid = target.value
    if (!grid) return
    grid
      .querySelectorAll<HTMLElement>('.link-card')
      .forEach((c) => c.style.removeProperty('--dock-scale'))
  }

  function onLeave() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    lastEvent = null
    reset()
  }

  function bind() {
    const grid = target.value
    if (!grid || bound) return
    grid.addEventListener('pointermove', onMove)
    grid.addEventListener('pointerleave', onLeave)
    bound = true
  }
  function unbind() {
    const grid = target.value
    if (grid) {
      grid.removeEventListener('pointermove', onMove)
      grid.removeEventListener('pointerleave', onLeave)
    }
    bound = false
    onLeave()
  }

  onMounted(bind)
  onBeforeUnmount(unbind)

  if (opts.disabled) {
    watch(opts.disabled, (v) => (v ? unbind() : bind()))
  }
}
