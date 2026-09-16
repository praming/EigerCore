// 本地环境声明：sortablejs 未自带类型，且项目未引入 @types/sortablejs。
// 仅声明 SPA 实际用到的 API 表面，足以通过 vue-tsc 严格模式检查。
declare module 'sortablejs' {
  export interface SortableEvent {
    /** 拖拽起始下标（可能为 null） */
    oldIndex: number | null
    /** 拖拽结束下标（可能为 null） */
    newIndex: number | null
    /** 被拖动的原始 DOM 元素 */
    item: HTMLElement
    /** 来源容器 */
    from: HTMLElement
    /** 目标容器 */
    to: HTMLElement
    /** 其他字段透传 */
    [key: string]: unknown
  }

  export interface Options {
    group?: string | { name?: string; pull?: string | boolean; put?: string | boolean; [k: string]: unknown }
    sort?: boolean
    disabled?: boolean
    animation?: number
    handle?: string
    draggable?: string
    ghostClass?: string
    chosenClass?: string
    dragClass?: string
    filter?: string
    onStart?: (evt: SortableEvent) => void
    onEnd?: (evt: SortableEvent) => void
    [key: string]: unknown
  }

  export default class Sortable {
    static create(element: HTMLElement, options?: Options): Sortable
    /** 动态修改选项（如启用/禁用） */
    option(name: string, value: unknown): void
    /** 销毁实例、移除事件监听 */
    destroy(): void
    /** 绑定到的根元素 */
    el: HTMLElement
  }
}
