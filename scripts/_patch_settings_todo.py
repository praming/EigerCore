import io

PATH = r"D:\wwwroot\workbuddy\python-nav\web\src\components\WbCardSettings.vue"

with io.open(PATH, "r", encoding="utf-8") as f:
    s = f.read()

repls = []

# (A) 移除写死的 TODO_CATS 常量声明，分类改由 store 提供
oldA = """// 待办默认分类（提前声明，供下方 todoCatOpts 在 setup 期安全引用，避免 TDZ）
const TODO_CATS = ['工作', '生活', '其他']"""
newA = """// 待办分类直接来自 store（设置页可增删 / 改名 / 拖拽排序），默认三分类由 store 初始化"""
repls.append((oldA, newA))

# (B) todoCatOpts 改为响应式，跟随 store 分类列表
oldB = "const todoCatOpts = TODO_CATS.map((c) => ({ label: c, value: c }))"
newB = "const todoCatOpts = computed(() => wb.prefs.todo.categories.map((c) => ({ label: c, value: c })))"
repls.append((oldB, newB))

# (C) 在 showDoneModel 之后插入分类管理逻辑（新增 / 改名 / 删除 / 拖拽排序）
oldC = """const showDoneModel = computed({
  get: () => wb.prefs.todo.showCompleted,
  set: (v: boolean) => wb.updatePref('todo', { showCompleted: v }),
})"""
newC = """const showDoneModel = computed({
  get: () => wb.prefs.todo.showCompleted,
  set: (v: boolean) => wb.updatePref('todo', { showCompleted: v }),
})
// 待办分类管理：新增 / 改名 / 删除 / 拖拽排序（A 项需求）
const newCatName = ref('')
const editingCat = ref<string | null>(null)
const editCatName = ref('')
const dragCatName = ref<string | null>(null)
function addTodoCat() {
  const n = newCatName.value.trim()
  if (!n) return
  wb.addTodoCategory(n)
  newCatName.value = ''
}
function startEditCat(name: string) {
  editingCat.value = name
  editCatName.value = name
}
function saveEditCat() {
  if (editingCat.value == null) return
  wb.updateTodoCategory(editingCat.value, editCatName.value)
  editingCat.value = null
  editCatName.value = ''
}
function cancelEditCat() {
  editingCat.value = null
  editCatName.value = ''
}
function delTodoCat(name: string) {
  wb.removeTodoCategory(name)
}
function onCatDragStart(name: string) {
  dragCatName.value = name
}
function onCatDragOver(e: DragEvent, name: string) {
  e.preventDefault()
  if (!dragCatName.value || dragCatName.value === name) return
  const names = [...wb.prefs.todo.categories]
  const from = names.indexOf(dragCatName.value)
  const to = names.indexOf(name)
  if (from < 0 || to < 0) return
  names.splice(to, 0, names.splice(from, 1)[0])
  wb.reorderTodoCategory(names)
}
function onCatDragEnd() {
  dragCatName.value = null
}"""
repls.append((oldC, newC))

# (D) 在「显示已完成分组」与「排版」之间插入分类管理 UI
oldD = """          <div class="wb-opt">
            <span class="wb-opt__label">显示已完成分组</span>
            <WbSwitch v-model="showDoneModel" />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">排版</div>"""
newD = """          <div class="wb-opt">
            <span class="wb-opt__label">显示已完成分组</span>
            <WbSwitch v-model="showDoneModel" />
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">分类管理（拖拽排序 · 至少保留 1 个）</div>
          <div class="wb-tsort">
            <div
              v-for="(c, i) in wb.prefs.todo.categories"
              :key="c"
              class="wb-tsort__row"
              :class="{ 'is-dragging': dragCatName === c, 'is-editing': editingCat === c }"
              draggable="true"
              @dragstart="onCatDragStart(c)"
              @dragover="onCatDragOver($event, c)"
              @dragend="onCatDragEnd"
            >
              <span class="wb-tsort__handle" title="拖拽排序"><AppIcon name="grip-vertical" :size="16" /></span>
              <template v-if="editingCat === c">
                <input class="wb-input wb-tsort__edit" v-model="editCatName" @keyup.enter="saveEditCat" @keyup.esc="cancelEditCat" />
                <button class="wb-cell__btn" @click="saveEditCat" aria-label="保存"><AppIcon name="check" :size="14" /></button>
                <button class="wb-cell__btn" @click="cancelEditCat" aria-label="取消"><AppIcon name="x" :size="14" /></button>
              </template>
              <template v-else>
                <span class="wb-tsort__name">{{ c }}</span>
                <span class="wb-tsort__idx">{{ i + 1 }}</span>
                <button class="wb-cell__btn" @click="startEditCat(c)" aria-label="重命名"><AppIcon name="pencil" :size="14" /></button>
                <button class="wb-cell__btn wb-cell__btn--danger" :disabled="wb.prefs.todo.categories.length <= 1" @click="delTodoCat(c)" aria-label="删除"><AppIcon name="trash-2" :size="14" /></button>
              </template>
            </div>
          </div>
          <div class="wb-row" style="margin-top:.6rem;align-items:flex-end">
            <input class="wb-input" v-model="newCatName" placeholder="新分类名称" @keyup.enter="addTodoCat" />
            <button class="btn btn-sm" @click="addTodoCat">添加</button>
          </div>
          <div class="wb-pop__sec" style="margin-top: 1rem">排版</div>"""
repls.append((oldD, newD))

for i, (o, n) in enumerate(repls, 1):
    cnt = s.count(o)
    if cnt != 1:
        raise SystemExit(f"[FAIL] settings repl#{i} matched {cnt} times (expected 1)")
    s = s.replace(o, n)

with io.open(PATH, "w", encoding="utf-8") as f:
    f.write(s)

print("settings todo patches applied OK (4 repls)")
