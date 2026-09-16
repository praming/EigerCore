<script lang="ts">
import { computed, defineComponent, h } from 'vue'
import type { PropType, VNode } from 'vue'
import type { LucideIconNode } from '@/types/lucide'

/**
 * 动态 Lucide 图标。
 *
 * 与 Jinja 版 `<i data-lucide="xxx">` 完全等价：图标数据取自 window.lucide
 * （由 index.html 引入的 /static/js/lucide.min.js 提供），因此：
 *  - 不把整个图标库打进 bundle（否则 JS 体积 +680kB）；
 *  - 链接图标名来自数据库自由字符串，需运行期按名解析，未知名回退 link。
 *
 * 用渲染函数而非模板：图标数据是递归节点树，h() 直出可保持 SVG 命名空间正确。
 */
export default defineComponent({
  name: 'AppIcon',
  props: {
    /** kebab-case 图标名，如 'compass' / 'arrow-up-to-line' */
    name: {
      type: String as PropType<string | null>,
      default: 'link',
    },
    size: {
      type: [Number, String] as PropType<number | string>,
      default: 20,
    },
  },
  setup(props) {
    const kebab = computed(() => (props.name || 'link').trim() || 'link')

    /** kebab-case → PascalCase（lucide 导出键名） */
    function toPascal(name: string): string {
      return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
    }

    const node = computed<LucideIconNode | null>(() => {
      const icons = window.lucide?.icons
      if (!icons) return null
      return icons[toPascal(kebab.value)] || icons.Link || null
    })

    function renderNode(n: LucideIconNode): VNode {
      const [tag, attrs, children] = n
      return h(tag, attrs, (children || []).map(renderNode))
    }

    return () => {
      const n = node.value
      if (!n) return null
      const [tag, attrs, children] = n
      // 根 svg：用 size 覆盖默认 24×24；补 lucide 类名与原版保持一致
      return h(
        tag,
        {
          ...attrs,
          width: props.size,
          height: props.size,
          class: `lucide lucide-${kebab.value}`,
        },
        (children || []).map(renderNode)
      )
    }
  },
})
</script>
