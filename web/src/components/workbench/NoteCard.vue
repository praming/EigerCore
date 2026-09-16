<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore, type NoteItem } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const creating = ref(false)
const newTitle = ref('')
const newBody = ref('')

// 详情弹窗
const viewingId = ref<number | null>(null)
const editing = ref(false)
const editTitle = ref('')
const editBody = ref('')

const current = computed(() => cfg.value.items.find((n) => n.id === viewingId.value) || null)

// 软删除 + 撤销：点删除先暂存快照并立即从状态移除，弹窗保留显示「已删除」态，
// 底部浮出撤销条；5 秒内点撤销则原样恢复，超时则真正关闭（删除完成）。
const pendingDelete = ref<NoteItem | null>(null)
let undoTimer: ReturnType<typeof setTimeout> | null = null
function clearUndo() {
  if (undoTimer !== null) {
    clearTimeout(undoTimer)
    undoTimer = null
  }
}

const sorted = computed(() => {
  const list = cfg.value.items.slice()
  if (cfg.value.sortBy === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  else list.sort((a, b) => b.updatedAt - a.updatedAt)
  return list
})

// 行间距 / 字号（设置内可调）
const listStyle = computed(() => ({
  gap: cfg.value.lineGap + 'px',
  fontSize: cfg.value.fontSize + 'px',
}))
// 弹窗内边距（内容距弹窗边框的留白，设置内可调）——通过 CSS 变量驱动 head/body/foot
const popStyle = computed(() => ({
  '--note-pad': cfg.value.pad + 'px',
  '--note-outer-pad': cfg.value.outerPad + 'px',
}))

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function openCreate() {
  newTitle.value = ''
  newBody.value = ''
  creating.value = true
}
function closeCreate() {
  creating.value = false
  newTitle.value = ''
  newBody.value = ''
}
function create() {
  const title = newTitle.value.trim() || '未命名'
  wb.addNote(props.iid, title, newBody.value)
  closeCreate()
}

function openDetail(n: { id: number }) {
  // 打开其它笔记前，若有进行中的「已删除待撤销」，视为确认删除
  if (pendingDelete.value) {
    clearUndo()
    pendingDelete.value = null
  }
  viewingId.value = n.id
  editing.value = false
}
function closeDetail() {
  // 关闭即确认删除（若有进行中的撤销）：清理定时器与暂存快照
  clearUndo()
  pendingDelete.value = null
  viewingId.value = null
  editing.value = false
}
function startEdit() {
  if (!current.value) return
  editTitle.value = current.value.title
  editBody.value = current.value.body
  editing.value = true
}
function saveEdit() {
  if (viewingId.value == null) return
  wb.updateNote(props.iid, viewingId.value, { title: editTitle.value.trim() || '未命名', body: editBody.value })
  editing.value = false
}
function removeCurrent() {
  const id = viewingId.value
  if (id == null || pendingDelete.value || !current.value) return
  // 暂存快照（保留原 id / 内容 / updatedAt），随后立即从状态移除（列表消失、弹窗进入「已删除」态）
  pendingDelete.value = { ...current.value }
  wb.removeNote(props.iid, id)
  clearUndo()
  undoTimer = setTimeout(() => {
    // 超时未撤销：真正完成删除，关闭弹窗
    pendingDelete.value = null
    viewingId.value = null
    editing.value = false
    undoTimer = null
  }, 5000)
}
function undoDelete() {
  if (!pendingDelete.value) return
  // 原样恢复（store 按原 id 插回，sorted 展示顺序自动还原）
  wb.restoreNote(props.iid, pendingDelete.value)
  clearUndo()
  pendingDelete.value = null
}

onUnmounted(() => clearUndo())
</script>

<template>
  <WbCard :iid="iid" icon="file-text">
    <template #actions>
      <button class="wb-cell__btn" @click="openCreate" aria-label="新建记事" title="新建记事">
        <AppIcon name="plus" :size="16" />
      </button>
    </template>
    <div class="wb-notes">
      <div class="wb-notes__list" :style="listStyle">
        <div
          v-for="n in sorted"
          :key="n.id"
          class="wb-note__item"
          @click="openDetail(n)"
        >
          <span class="wb-note__title">{{ n.title }}</span>
          <span class="wb-note__dots" aria-hidden="true"></span>
          <span class="wb-note__date">{{ fmtDate(n.updatedAt) }}</span>
        </div>
        <div v-if="sorted.length === 0" class="wb-muted" style="font-size: .85rem">还没有记事</div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="creating" class="wb-pop__mask" @click.self="cfg.closeOnMask && closeCreate()">
        <div class="wb-pop wb-pop--note" :style="popStyle">
          <div class="wb-pop__head">
            <span class="wb-pop__title">新建记事</span>
            <button class="wb-cell__btn" @click="closeCreate" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
          </div>
          <div class="wb-pop__body">
            <div class="wb-dim">
              <span>标题</span>
              <input class="wb-input" v-model="newTitle" placeholder="标题" />
            </div>
            <div class="wb-dim" style="margin-top: .7rem">
              <span>内容</span>
              <textarea class="wb-input wb-note" v-model="newBody" rows="6" placeholder="写点什么…"></textarea>
            </div>
          </div>
          <div class="wb-pop__foot">
            <button class="btn btn-sm btn-ghost" @click="closeCreate">取消</button>
            <button class="btn btn-sm wb-note__save" @click="create">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 记事详情弹窗：右上角 编辑 / 删除 / 关闭 -->
    <Teleport to="body">
      <div v-if="current || pendingDelete" class="wb-pop__mask" @click.self="cfg.closeOnMask && closeDetail()">
        <div class="wb-pop wb-pop--note" :style="popStyle">
          <div class="wb-pop__head">
            <div class="wb-note__head">
              <span class="wb-note__head-title">{{ pendingDelete ? '已删除笔记' : (editing ? '编辑' : current.title) }}</span>
              <span v-if="!editing && !pendingDelete" class="wb-note__head-date">{{ fmtDate(current.updatedAt) }}</span>
              <button
                v-if="!editing && !pendingDelete"
                class="wb-cell__btn wb-cell__btn--inline"
                @click="startEdit"
                aria-label="编辑"
                title="编辑"
              >
                <AppIcon name="pencil" :size="15" />
              </button>
              <button
                v-if="!editing && !pendingDelete"
                class="wb-cell__btn wb-cell__btn--inline wb-cell__btn--danger-soft"
                @click="removeCurrent"
                aria-label="删除"
                title="删除"
              >
                <AppIcon name="trash-2" :size="15" />
              </button>
            </div>
            <div class="wb-card__right">
              <button class="wb-cell__btn" @click="closeDetail" aria-label="关闭" title="关闭">
                <AppIcon name="x" :size="16" />
              </button>
            </div>
          </div>
          <div class="wb-pop__body">
            <template v-if="pendingDelete">
              <div class="wb-note__deleted">该笔记已删除</div>
            </template>
            <template v-else-if="editing">
              <div class="wb-dim">
                <span>标题</span>
                <input class="wb-input" v-model="editTitle" placeholder="标题" />
              </div>
              <textarea
                class="wb-input wb-note"
                v-model="editBody"
                rows="9"
                placeholder="写点什么…"
                style="margin-top: .7rem"
              ></textarea>
            </template>
            <template v-else>
              <div class="wb-note__detail-body">{{ current.body || '（空）' }}</div>
            </template>
          </div>
          <div class="wb-pop__foot" v-if="editing">
            <button class="btn btn-sm btn-ghost" @click="editing = false">取消</button>
            <button class="btn btn-sm wb-note__save" @click="saveEdit">保存</button>
          </div>
          <div v-if="pendingDelete" class="wb-note__undo">
            <span class="wb-note__undo-text">已删除笔记</span>
            <button class="wb-note__undo-btn" type="button" @click="undoDelete">撤销</button>
            <span class="wb-note__undo-bar" aria-hidden="true"><i></i></span>
          </div>
        </div>
      </div>
    </Teleport>
  </WbCard>
</template>
