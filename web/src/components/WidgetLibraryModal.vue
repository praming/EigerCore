<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { useWorkbenchStore, WIDGET_META, type CardId } from '@/stores/workbench'
import AppIcon from './AppIcon.vue'
import WbSwitch from './WbSwitch.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-settings', iid: string): void
}>()

const wb = useWorkbenchStore()

// 所有内置组件类型（按 WIDGET_META 定义顺序），用于「添加组件」卡片网格
const widgetTypes = computed(() =>
  (Object.keys(WIDGET_META) as CardId[]).map((type) => ({
    type,
    name: WIDGET_META[type].name,
    icon: WIDGET_META[type].icon,
  })),
)

// 内联重命名（编辑按钮触发，保存后前端即时同步显示新标题）
const editingIid = ref<string | null>(null)
const draftTitle = ref('')
function startEdit(iid: string, currentTitle?: string) {
  editingIid.value = iid
  draftTitle.value = currentTitle || ''
}
function saveTitle() {
  if (editingIid.value == null) return
  wb.setInstanceTitle(editingIid.value, draftTitle.value.trim())
  editingIid.value = null
}
function cancelEdit() {
  editingIid.value = null
}

// 隐藏 / 显示（开关：开启=显示，关闭=隐藏；隐藏仅前端不渲染，不清除数据）
function toggleShow(iid: string, show: boolean) {
  wb.hideWidget(iid, !show)
}

// 删除（两步确认：先点删除，该卡片变为「确认 / 取消」）
const pendingDelete = ref<string | null>(null)
function askDelete(iid: string) {
  pendingDelete.value = iid
}
function confirmDelete() {
  if (pendingDelete.value == null) return
  wb.removeWidget(pendingDelete.value)
  pendingDelete.value = null
}
function cancelDelete() {
  pendingDelete.value = null
}

// 新增实例：每次都是独立实例（独立 config，数据互不干扰）；删除后重新添加恢复默认设置
function add(type: CardId) {
  wb.addWidget(type)
}

// 我的组件：拖拽排序（仅本页面，复用 reorderInstances；排序随 store 自动落盘，无需独立后端）
const instGridRef = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null
watch(
  () => props.open,
  async (open) => {
    await nextTick()
    if (open && instGridRef.value && !sortable) {
      sortable = Sortable.create(instGridRef.value, {
        animation: 180,
        handle: '.wb-cell__handle',
        onEnd: () => {
          if (!instGridRef.value) return
          const ids = Array.from(instGridRef.value.querySelectorAll('.wb-lib__card'))
            .map((el) => (el as HTMLElement).dataset.iid)
            .filter(Boolean) as string[]
          if (ids.length) wb.reorderInstances(ids)
        },
      })
    } else if (!open && sortable) {
      sortable.destroy()
      sortable = null
    }
  },
  { immediate: true },
)

function close() {
  pendingDelete.value = null
  editingIid.value = null
  emit('close')
}

// ESC 关闭
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    e.preventDefault()
    close()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  sortable?.destroy()
  sortable = null
})
</script>

<template>
  <div v-if="open" class="modal wb-lib-modal" @click.self="close">
    <div class="modal-box wb-lib">
      <header class="wb-lib__head">
        <div class="wb-lib__headtext">
          <div class="wb-lib__title">组件库</div>
          <p class="wb-lib__sub">
            上栏为已添加的小组件，下栏为可添加的内置组件；点右上角「+」后实例会即时出现在上栏。同类可加多个，数据彼此独立；上栏卡片可拖拽排序。
          </p>
        </div>
        <button class="wb-cell__btn" @click="close" aria-label="关闭">
          <AppIcon name="x" :size="16" />
        </button>
      </header>

      <div class="wb-lib__body">
        <!-- 上栏：我的组件 -->
        <div class="wb-lib__secthead">
          <span class="wb-lib__secttitle">我的组件</span>
          <span class="wb-lib__count">{{ wb.instances.length }}</span>
        </div>

        <div v-if="wb.instances.length" ref="instGridRef" class="wb-lib__grid wb-lib__grid--inst">
          <div
            v-for="inst in wb.instances"
            :key="inst.iid"
            class="wb-lib__card"
            :class="{ 'is-hidden': inst.hidden }"
            :data-iid="inst.iid"
          >
            <div class="wb-lib__card-top">
              <button class="wb-cell__btn wb-cell__handle" type="button" aria-label="拖拽排序" title="拖拽排序">
                <AppIcon name="grip-vertical" :size="14" />
              </button>
              <span class="wb-lib__ic"><AppIcon :name="WIDGET_META[inst.type].icon" :size="16" /></span>
              <div class="wb-lib__namegroup">
                <template v-if="editingIid === inst.iid">
                  <input
                    class="wb-input wb-lib__name-input"
                    v-model="draftTitle"
                    @keyup.enter="saveTitle"
                    @keyup.esc="cancelEdit"
                    @blur="saveTitle"
                  />
                </template>
                <template v-else>
                  <span class="wb-lib__name" :title="wb.widgetTitle(inst)">{{ wb.widgetTitle(inst) }}</span>
                </template>
                <span class="wb-lib__chips">
                  <span class="wb-lib__chip">{{ WIDGET_META[inst.type].name }}</span>
                  <span v-if="inst.hidden" class="wb-lib__chip wb-lib__chip--danger">已隐藏</span>
                </span>
              </div>
            </div>

            <div class="wb-lib__card-actions">
              <button v-if="editingIid === inst.iid" class="wb-cell__btn" @click="saveTitle" aria-label="保存">
                <AppIcon name="check" :size="14" />
              </button>
              <button v-else class="wb-cell__btn" @click="startEdit(inst.iid, inst.title)" aria-label="编辑">
                <AppIcon name="pencil" :size="14" />
              </button>
              <button class="wb-cell__btn" @click="emit('open-settings', inst.iid)" aria-label="设置">
                <AppIcon name="settings" :size="14" />
              </button>
              <div class="wb-lib__del">
                <template v-if="pendingDelete === inst.iid">
                  <button class="wb-cell__btn wb-cell__btn--danger" @click="confirmDelete" aria-label="确认删除">
                    <AppIcon name="check" :size="14" />
                  </button>
                  <button class="wb-cell__btn" @click="cancelDelete" aria-label="取消">
                    <AppIcon name="x" :size="14" />
                  </button>
                </template>
                <button v-else class="wb-cell__btn wb-cell__btn--danger" @click="askDelete(inst.iid)" aria-label="删除">
                  <AppIcon name="trash-2" :size="14" />
                </button>
              </div>
              <label class="wb-lib__show">
                <span>显示</span>
                <WbSwitch :model-value="!inst.hidden" @update:model-value="(v: boolean) => toggleShow(inst.iid, v)" />
              </label>
            </div>
          </div>
        </div>
        <p v-else class="wb-lib__empty">还没有添加任何组件，从下方「添加组件」挑选吧。</p>

        <!-- 下栏：添加组件 -->
        <div class="wb-lib__secthead wb-lib__secthead--sep">
          <span class="wb-lib__secttitle">添加组件</span>
          <span class="wb-lib__hint">内置 {{ widgetTypes.length }} 种</span>
        </div>

        <div class="wb-lib__grid wb-lib__grid--add">
          <div v-for="meta in widgetTypes" :key="meta.type" class="wb-lib__addcard">
            <button class="wb-cell__btn wb-lib__addbtn" type="button" @click="add(meta.type)" aria-label="添加">
              <AppIcon name="plus" :size="16" />
            </button>
            <div class="wb-lib__addic"><AppIcon :name="meta.icon" :size="18" /></div>
            <div class="wb-lib__addname">{{ meta.name }}</div>
            <div class="wb-lib__adddesc">{{ WIDGET_META[meta.type].desc }}</div>
          </div>
        </div>
      </div>

      <footer class="wb-lib__foot">
        <span class="wb-lib__hint">共 {{ wb.instances.length }} 个组件实例</span>
        <button class="btn btn-sm" type="button" @click="close">完成</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 复用 .modal / .modal-box 外壳；此处把 modal-box 改为「头+滚动体+脚」三段式布局，宽度加宽到约 2/3 屏 */
.wb-lib {
  display: flex;
  flex-direction: column;
  width: min(92vw, 920px);
  max-width: 920px;
  max-height: 88vh;
  padding: 0;
  gap: 0;
}
.wb-lib__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid hsl(var(--bc) / 0.1);
  flex: none;
}
.wb-lib__title {
  font-weight: 600;
  font-size: 1.05rem;
}
.wb-lib__sub {
  margin: 0.35rem 0 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: hsl(var(--bc) / 0.6);
}
.wb-lib__body {
  padding: 0.5rem 1.25rem 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1 1 auto;
  min-height: 0;
}
.wb-lib__secthead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0 0.65rem;
}
.wb-lib__secthead--sep {
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid hsl(var(--bc) / 0.08);
}
.wb-lib__secttitle {
  font-weight: 600;
  font-size: 0.92rem;
  color: hsl(var(--bc) / 0.9);
}
.wb-lib__hint {
  font-size: 0.76rem;
  color: hsl(var(--bc) / 0.5);
}
.wb-lib__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: hsl(var(--p) / 0.12);
  color: hsl(var(--p));
  font-size: 0.72rem;
  font-weight: 600;
}

.wb-lib__grid {
  display: grid;
  gap: 0.65rem;
}
.wb-lib__grid--inst {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.wb-lib__grid--add {
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

/* 已添加实例卡片 */
.wb-lib__card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  border-radius: 0.8rem;
  background: hsl(var(--b1));
  border: 1px solid hsl(var(--bc) / 0.08);
}
.wb-lib__card.is-hidden {
  opacity: 0.6;
  background: hsl(var(--bc) / 0.03);
}
.wb-lib__card-top {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
.wb-lib__ic {
  flex: none;
  color: hsl(var(--p));
  display: inline-flex;
}
.wb-lib__namegroup {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.wb-lib__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 500;
}
.wb-lib__chips {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
.wb-lib__name-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.25rem 0.45rem;
  font-size: 0.9rem;
}
.wb-lib__chip {
  flex: none;
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: hsl(var(--bc) / 0.08);
  color: hsl(var(--bc) / 0.65);
}
.wb-lib__chip--danger {
  background: hsl(var(--er) / 0.12);
  color: hsl(var(--er));
}
.wb-lib__del {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.15rem;
}
.wb-lib__card-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.wb-lib__show {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  font-size: 0.76rem;
  color: hsl(var(--bc) / 0.7);
}

/* 可添加内置组件卡片 */
.wb-lib__addcard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.25rem;
  padding: 0.85rem 0.6rem 0.8rem;
  border-radius: 0.8rem;
  background: hsl(var(--b2) / 0.5);
  border: 1px solid hsl(var(--bc) / 0.06);
}
.wb-lib__addbtn {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  color: hsl(var(--p));
}
.wb-lib__addic {
  color: hsl(var(--p));
  display: inline-flex;
  margin-top: 0.1rem;
}
.wb-lib__addname {
  font-size: 0.88rem;
  font-weight: 500;
}
.wb-lib__adddesc {
  font-size: 0.72rem;
  color: hsl(var(--bc) / 0.5);
  line-height: 1.3;
  min-height: 1.9em;
}

.wb-lib__empty {
  margin: 0;
  font-size: 0.8rem;
  color: hsl(var(--bc) / 0.5);
  padding: 0.4rem 0 0.6rem;
}
.wb-lib__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid hsl(var(--bc) / 0.1);
  flex: none;
}
</style>
