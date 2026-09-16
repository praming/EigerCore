<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import WbSelect from '../WbSelect.vue'
import { useWorkbenchStore } from '@/stores/workbench'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const filter = ref<'all' | string>('all')

// 分类选项：全部 + 设置页维护的分类列表（来自 store，保证与设置页一致）
const catOpts = computed(() => cfg.value.categories.map((c) => ({ label: c, value: c })))
const filterOpts = computed(() => [{ label: '全部', value: 'all' }, ...catOpts.value])

// —— 待办弹窗添加 ——
const creating = ref(false)
const newText = ref('')
const newCat = ref(cfg.value.defaultCategory)
const newTextEl = ref<HTMLTextAreaElement | null>(null)

// 未完成项（主列表），按分类过滤
const activeList = computed(() => {
  let list = cfg.value.items.filter((t) => !t.done)
  if (filter.value !== 'all') list = list.filter((t) => t.category === filter.value)
  return list
})

// 已完成项（全部，弹窗页展示，不受分类过滤限制）
const doneAll = computed(() =>
  cfg.value.items.filter((t) => t.done).sort((a, b) => b.id - a.id),
)

const remain = computed(() => cfg.value.items.filter((t) => !t.done).length)

// 行间距 / 字号（设置内可调）
const listStyle = computed(() => ({
  gap: cfg.value.lineGap + 'px',
  fontSize: cfg.value.fontSize + 'px',
}))

// —— 已完成弹窗：多选 / 恢复 / 批量删除 ——
const showDone = ref(false)
const selDone = ref<number[]>([])
const allDoneSel = computed(
  () => doneAll.value.length > 0 && doneAll.value.every((d) => selDone.value.includes(d.id)),
)
function toggleDoneSel(id: number) {
  selDone.value = selDone.value.includes(id)
    ? selDone.value.filter((x) => x !== id)
    : [...selDone.value, id]
}
function toggleSelAll() {
  selDone.value = allDoneSel.value ? [] : doneAll.value.map((d) => d.id)
}
function removeSelected() {
  const set = new Set(selDone.value)
  for (const id of doneAll.value.map((d) => d.id)) {
    if (set.has(id)) wb.removeTodo(props.iid, id)
  }
  selDone.value = []
}
function restoreSelected() {
  const set = new Set(selDone.value)
  for (const t of doneAll.value) {
    if (set.has(t.id)) wb.updateTodo(props.iid, t.id, { done: false })
  }
  selDone.value = []
}
function closeDone() {
  showDone.value = false
  selDone.value = []
}

function openCreate() {
  newText.value = ''
  newCat.value = filter.value === 'all' ? cfg.value.defaultCategory : filter.value
  creating.value = true
  nextTick(() => newTextEl.value?.focus())
}
function closeCreate() {
  creating.value = false
  newText.value = ''
}
function create() {
  const text = newText.value.trim()
  if (!text) return
  wb.addTodo(props.iid, text, newCat.value)
  closeCreate()
}
function toggle(t: { id: number; done: boolean }) {
  wb.updateTodo(props.iid, t.id, { done: !t.done })
}
function remove(t: { id: number }) {
  wb.removeTodo(props.iid, t.id)
}
</script>

<template>
  <WbCard icon="check-square">
    <template #title>
      <h3 class="wb-card__title">待办事项</h3>
      <span class="wb-todo__count" :title="`剩余 ${remain} 项未办`">{{ remain }}</span>
    </template>
    <template #actions>
      <WbSelect :options="filterOpts" v-model="filter" class="wb-todo__filter-sel" />
      <button class="wb-cell__btn" @click="showDone = true" aria-label="已完成" title="已完成">
        <AppIcon name="laptop-minimal-check" :size="16" />
      </button>
      <button class="wb-cell__btn" @click="openCreate" aria-label="添加待办" title="添加待办">
        <AppIcon name="plus" :size="16" />
      </button>
    </template>
    <div class="wb-todo">
      <ul class="wb-todo__list" :style="listStyle">
        <li v-for="t in activeList" :key="t.id">
          <button class="wb-todo__check" @click="toggle(t)" aria-label="切换完成">
            <AppIcon v-if="t.done" name="check" :size="14" />
          </button>
          <span class="wb-todo__text" @click="toggle(t)">{{ t.text }}</span>
          <span class="wb-todo__cat">{{ t.category }}</span>
          <button class="wb-todo__del" @click="remove(t)" aria-label="删除">
            <AppIcon name="x" :size="14" />
          </button>
        </li>
        <li v-if="activeList.length === 0" class="wb-muted">暂无待办，点右上角 + 添加</li>
      </ul>
    </div>

    <!-- 添加待办弹窗 -->
    <Teleport to="body">
      <div v-if="creating" class="wb-pop__mask" @click.self="closeCreate">
        <div class="wb-pop">
          <div class="wb-pop__head">
            <span class="wb-pop__title">添加待办</span>
            <button class="wb-cell__btn" @click="closeCreate" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
          </div>
          <div class="wb-pop__body">
            <div class="wb-dim">
              <span>内容</span>
              <textarea
                ref="newTextEl"
                class="wb-input wb-note"
                v-model="newText"
                rows="3"
                placeholder="要做什么…（Ctrl/⌘ + Enter 快速添加）"
                @keydown.ctrl.enter="create"
                @keydown.meta.enter="create"
              ></textarea>
            </div>
            <div class="wb-row" style="margin-top:.7rem">
              <label>分类</label>
              <WbSelect :options="catOpts" v-model="newCat" />
            </div>
          </div>
          <div class="wb-pop__foot">
            <button class="btn btn-sm btn-ghost" @click="closeCreate">取消</button>
            <button class="btn btn-sm" @click="create">添加</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 已完成弹窗：展示所有已完成的待办 -->
    <Teleport to="body">
      <div v-if="showDone" class="wb-pop__mask" @click.self="closeDone">
        <div class="wb-pop wb-pop--done">
          <div class="wb-pop__head">
            <div class="wb-pop__head-left">
              <span class="wb-pop__title">已完成 ({{ doneAll.length }})</span>
              <div class="wb-todo__done-acts">
                <button class="wb-link" @click="toggleSelAll">{{ allDoneSel ? '取消全选' : '全选' }}</button>
                <button class="wb-link" :disabled="selDone.length === 0" @click="restoreSelected">恢复选中</button>
                <button class="wb-link wb-link--danger" :disabled="selDone.length === 0" @click="removeSelected">删除选中</button>
              </div>
            </div>
            <button class="wb-cell__btn" @click="closeDone" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
          </div>
          <div class="wb-pop__body" v-if="doneAll.length">
            <ul class="wb-todo__list wb-todo__list--done" :style="listStyle">
                <li v-for="t in doneAll" :key="t.id" :class="{ sel: selDone.includes(t.id) }">
                <input
                  type="checkbox"
                  class="wb-todo__sel"
                  :checked="selDone.includes(t.id)"
                  @change="toggleDoneSel(t.id)"
                  title="选择"
                />
                <span class="wb-todo__text done" @click="toggle(t)">{{ t.text }}</span>
                <span class="wb-todo__cat">{{ t.category }}</span>
                <button class="wb-todo__del" @click="remove(t)" aria-label="删除">
                  <AppIcon name="x" :size="14" />
                </button>
              </li>
            </ul>
          </div>
          <div class="wb-pop__body wb-muted" v-else>暂无已完成的待办</div>
        </div>
      </div>
    </Teleport>
  </WbCard>
</template>
