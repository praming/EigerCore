import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import Sortable, { type Options } from 'sortablejs'

/**
 * SortableJS 的 Vue 封装。
 *
 * - target：挂载拖拽的容器元素（ref，组件卸载时自动 destroy）
 * - buildOptions：返回 Sortable 配置（用函数形式，确保闭包拿到最新 store 动作）
 * - opts.disabled：可选响应式开关，用于「仅在编辑模式启用拖拽」
 *
 * 复用后端 /update-order 与 /group/update-order 端点，onEnd 中由调用方提交新顺序。
 */
export function useSortable(
  target: Ref<HTMLElement | null>,
  buildOptions: () => Options,
  opts: { disabled?: Ref<boolean> } = {}
) {
  let instance: Sortable | null = null

  function create() {
    if (instance || !target.value) return
    instance = Sortable.create(target.value, buildOptions())
  }
  function destroy() {
    instance?.destroy()
    instance = null
  }

  onMounted(() => {
    if (!opts.disabled?.value) create()
  })

  if (opts.disabled) {
    watch(opts.disabled, (disabled) => {
      if (disabled) destroy()
      else create()
    })
  }

  onBeforeUnmount(destroy)

  return { destroy, recreate: create }
}
