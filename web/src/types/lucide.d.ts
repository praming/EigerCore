// 全局 window.lucide 类型声明
// 来源：app/static/js/lucide.min.js（lucide v0.469.0 UMD，由 index.html 以经典 script 引入）
// 图标数据形态为递归节点树：[标签名, 属性表, 子节点?]
// 例：Compass = ['svg', { viewBox: '0 0 24 24', ... }, [['path', { d: '...' }], ['circle', {...}]]]

export type LucideIconNode = [
  string,
  Record<string, string | number>,
  LucideIconNode[]?
]

export interface LucideGlobal {
  /** 全部图标，键为 PascalCase（如 Compass / ArrowUpToLine），共 1743 个 */
  icons: Record<string, LucideIconNode>
  createIcons: (options?: Record<string, unknown>) => void
  createElement: (node: LucideIconNode) => SVGElement
}

declare global {
  interface Window {
    lucide?: LucideGlobal
  }
}
