import { onMounted, onBeforeUnmount, watch, nextTick, type Ref } from 'vue'

export interface SpySection {
  id: number
  el: HTMLElement
}

/**
 * 滚动联动（总览视图）：监听滚动容器的 scroll 事件，按「激活线（容器顶 + 30% 高）」下方的
 * 最后一个分段作为当前分段，上报 id 供侧栏高亮。
 *
 * 相比 IntersectionObserver 方案的优势：
 *  - 选定是确定的（最后一个 top 越过激活线的分段），分组边界处不再上下跳动；
 *  - 滚动到容器最底部时强制选中最后一个分段，不会再回跳到第一个分组。
 */
export function useScrollSpy(
  getRoot: () => HTMLElement | null,
  getSections: () => SpySection[],
  onActive: (id: number | null) => void
) {
  let raf = 0
  let ticking = false

  function compute() {
    ticking = false
    const root = getRoot()
    const sections = getSections()
    if (!root || sections.length === 0) return
    const rootRect = root.getBoundingClientRect()
    const line = rootRect.top + rootRect.height * 0.3
    // 触底：剩余可滚动距离极小 → 强制选中最后一段
    const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight <= 2
    if (atBottom) {
      onActive(sections[sections.length - 1].id)
      return
    }
    // 最后一个 top 越过激活线的分段即为当前分段
    let current: number | null = null
    for (const s of sections) {
      const r = s.el.getBoundingClientRect()
      if (r.top <= line) current = s.id
      else break
    }
    // 首段顶部仍在激活线下方（位于列表最上方）→ 仍高亮首段
    if (current === null) current = sections[0].id
    onActive(current)
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    raf = requestAnimationFrame(compute)
  }

  function build() {
    destroy()
    nextTick(() => {
      const root = getRoot()
      if (!root) return
      root.addEventListener('scroll', onScroll, { passive: true })
      compute()
    })
  }

  function destroy() {
    const root = getRoot()
    if (root) root.removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    ticking = false
  }

  onMounted(build)
  onBeforeUnmount(destroy)
  // 数据刷新（视图/分类切换）后重建监听并立即重算
  watch(getSections, () => build())

  return { build, destroy }
}
