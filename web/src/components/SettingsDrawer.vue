<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { adminApi } from '@/api'
import AppModal from './AppModal.vue'
import ThemePicker from './ThemePicker.vue'
import AppIcon from './AppIcon.vue'
import WbSwitch from './WbSwitch.vue'
import type { CustomThemeDTO, UserDTO, ApiError } from '@/types/api'

const store = useDashboardStore()

// —— 外观（系统设置）——
const dockScale = ref(1.4)
const openInNew = ref(true)
const sessionDays = ref(30)
const linksPerRow = ref(4)

// —— 站点：开放注册开关（表单态，随统一「保存」提交，不再即时生效）——
const allowRegisterLocal = ref(true)

// —— 总站默认进入页面（导航页面 / 工作台）——
// 开关 ON = 工作台，OFF = 导航页面
const defaultIsWorkbench = ref(false)
// —— 导航分类默认进入的子视图（分组视图 / 总览视图）——
const defaultNavView = ref<'nav' | 'overview'>('nav')
// 打开时快照当前主题，供「取消」时还原
const savedTheme = ref<string | undefined>(undefined)
// 是否在内置主题右侧显示删除（×）按钮（设置页「主题」标题处开关控制）
const showThemeDelete = ref(false)

// —— 系统设置（站点品牌）——
const siteName = ref('Eiger')
const siteTitle = ref('')
const siteSubtitle = ref('')
const siteLogo = ref('')
// —— 字体设置（管理员可见）——
const FONT_SANS_DEFAULT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const FONT_CJK_DEFAULT = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
const fontSans = ref(FONT_SANS_DEFAULT)
const fontCjk = ref(FONT_CJK_DEFAULT)
// —— 导航分类默认进入的子视图（分组视图 / 总览视图）下拉框 ——
const navViewOpen = ref(false)
const navViewRef = ref<HTMLElement | null>(null)
const navViewOptions = [
  { value: 'nav' as const, label: '分组视图' },
  { value: 'overview' as const, label: '总览视图' },
]
const navViewLabel = computed(
  () => navViewOptions.find((o) => o.value === defaultNavView.value)?.label ?? '分组视图'
)
function pickNavView(v: 'nav' | 'overview') {
  defaultNavView.value = v
  navViewOpen.value = false
}
function onNavDocClick(e: MouseEvent) {
  if (navViewOpen.value && navViewRef.value && !navViewRef.value.contains(e.target as Node)) {
    navViewOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', onNavDocClick))
onUnmounted(() => document.removeEventListener('click', onNavDocClick))

// —— 自定义配色表单 ——
const ctName = ref('')
const ctPrimary = ref('#4f46e5')
const ctSecondary = ref('#0ea5e9')
const ctBackground = ref('#ffffff')
const ctText = ref('#1f2937')
const ctAccent = ref('#f59e0b')
// 编辑态：非 null 表示正在编辑该 id 的自定义主题（表单标题/按钮切换为「保存修改」）
const editingCtId = ref<number | null>(null)

// —— 数据导入/还原 ——
// 文件选择器在 dialog 之外动态创建，避免取消原生文件框时连带触发设置弹窗的关闭
function pickFile(accept: string, handler: (file: File) => void) {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = accept
  inp.style.display = 'none'
  inp.addEventListener('change', () => {
    const f = inp.files?.[0]
    if (f) handler(f)
    inp.remove()
  })
  document.body.appendChild(inp)
  inp.click()
}
function onImportClick() {
  pickFile('.json,.xlsx,.xls,.html,.htm', (f) => store.importData(f))
}
function onRestoreClick() {
  pickFile('.zip', (f) => store.restoreData(f))
}

function syncFromStore() {
  const s = store.settings
  if (s) {
    dockScale.value = s.dock_scale
    openInNew.value = s.open_in_new
    sessionDays.value = s.session_days
    linksPerRow.value = s.links_per_row ?? 4
    defaultIsWorkbench.value = (s.default_view ?? 'nav') === 'workbench'
    defaultNavView.value = (s.default_nav_view as 'nav' | 'overview') || 'nav'
    savedTheme.value = s.theme
  }
  // 开放注册开关为表单态：回显当前已持久化值，随统一「保存」提交；「取消」时由本函数复位
  allowRegisterLocal.value = store.allowRegister
  // 「显示删除」开关默认关闭（每次打开复位为关闭，用户可临时开启）
  showThemeDelete.value = false
  // 站点品牌：回显已持久化值（缺省给默认值），随统一「保存」提交
  siteName.value = store.siteSettings?.site_name || 'Eiger'
  siteTitle.value = store.siteSettings?.site_title || ''
  siteSubtitle.value = store.siteSettings?.site_subtitle || ''
  siteLogo.value = store.siteSettings?.site_logo || ''
  // 字体设置：回显已持久化值（缺省给内置默认），随统一「保存」提交
  fontSans.value = store.siteSettings?.font_sans || FONT_SANS_DEFAULT
  fontCjk.value = store.siteSettings?.font_cjk || FONT_CJK_DEFAULT
  // 打开设置时复位自定义配色编辑态（避免上次编辑残留）
  editingCtId.value = null
  resetCtForm()
  // 管理员专属：拉取用户列表（非管理员时 loadUsers 内部会清空）
  loadUsers()
}

function resetCtForm() {
  ctName.value = ''
  ctPrimary.value = '#4f46e5'
  ctSecondary.value = '#0ea5e9'
  ctBackground.value = '#ffffff'
  ctText.value = '#1f2937'
  ctAccent.value = '#f59e0b'
}

// 进入编辑态：把目标主题配色载入表单
function startEditCt(c: CustomThemeDTO) {
  editingCtId.value = c.id
  ctName.value = c.name
  ctPrimary.value = c.primary
  ctSecondary.value = c.secondary
  ctBackground.value = c.background
  ctText.value = c.text
  ctAccent.value = c.accent || '#f59e0b'
}
function cancelEditCt() {
  editingCtId.value = null
  resetCtForm()
}

watch(
  () => store.settingsDrawerOpen,
  (open) => {
    if (open) syncFromStore()
  },
  { immediate: true }
)

function saveAppearance() {
  store.updateSettings({
    dock_scale: dockScale.value,
    open_in_new: openInNew.value,
    session_days: sessionDays.value,
    links_per_row: linksPerRow.value,
  })
}

// 系统设置（站点品牌 + 字体）：随统一「保存」提交；站点名称缺省回退 'Eiger'
function saveSite() {
  store.updateSite({
    site_name: siteName.value.trim() || 'Eiger',
    site_title: siteTitle.value.trim(),
    site_subtitle: siteSubtitle.value.trim(),
    site_logo: siteLogo.value.trim(),
    font_sans: fontSans.value.trim() || FONT_SANS_DEFAULT,
    font_cjk: fontCjk.value.trim() || FONT_CJK_DEFAULT,
  })
}

// 统一保存：外观 + 资料 + 开放注册（均为表单态，仅在点击「保存」时提交）
// 仅对「实际有修改」的分项提交并提示，避免无改动也弹多条「已保存」
function saveAll() {
  const s = store.settings
  const appearanceChanged =
    !s ||
    s.dock_scale !== dockScale.value ||
    s.open_in_new !== openInNew.value ||
    s.session_days !== sessionDays.value ||
    (s.links_per_row ?? 4) !== linksPerRow.value
  const viewChanged = (s?.default_view ?? 'nav') !== (defaultIsWorkbench.value ? 'workbench' : 'nav')
  const navViewChanged = (s?.default_nav_view ?? 'nav') !== defaultNavView.value
  // 注册开关：表单态，仅当与已持久化值不同才提交（随统一「保存」生效）
  const registerChanged = allowRegisterLocal.value !== store.allowRegister
  // 站点品牌：任一字段与已持久化值不同即提交
  const ss = store.siteSettings
  const siteChanged =
    (ss?.site_name || 'Eiger') !== (siteName.value.trim() || 'Eiger') ||
    (ss?.site_title || '') !== siteTitle.value.trim() ||
    (ss?.site_subtitle || '') !== siteSubtitle.value.trim() ||
    (ss?.site_logo || '') !== siteLogo.value.trim() ||
    (ss?.font_sans || '') !== fontSans.value.trim() ||
    (ss?.font_cjk || '') !== fontCjk.value.trim()

  if (appearanceChanged) saveAppearance()
  if (viewChanged) store.setDefaultView(defaultIsWorkbench.value ? 'workbench' : 'nav')
  if (navViewChanged) store.setNavView(defaultNavView.value)
  if (registerChanged) store.setRegisterOpen(allowRegisterLocal.value)
  if (siteChanged) saveSite()
  store.closeSettings()
}

// 取消：还原表单字段与主题快照后关闭，不持久化任何改动
function cancelEdit() {
  syncFromStore()
  if (savedTheme.value && store.settings?.theme !== savedTheme.value) {
    store.setTheme(savedTheme.value)
  }
  store.closeSettings()
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
function addCustomTheme() {
  const fields = {
    name: ctName.value.trim() || '我的配色',
    primary: ctPrimary.value,
    secondary: ctSecondary.value,
    background: ctBackground.value,
    text: ctText.value,
    accent: ctAccent.value,
  }
  for (const [k, v] of Object.entries(fields)) {
    if (k !== 'name' && !HEX_RE.test(v)) {
      store.pushToast(`颜色 ${k} 需为 #rrggbb 格式`, 'error')
      return
    }
  }
  if (editingCtId.value !== null) {
    const id = editingCtId.value
    store.updateCustomTheme(id, fields)
    editingCtId.value = null
  } else {
    store.createCustomTheme(fields)
  }
  resetCtForm()
}

// —— 用户管理（仅管理员可见，后端 @admin_required 二次保护）——
const users = ref<UserDTO[]>([])
const editingUser = ref<UserDTO | null>(null)
const editNickname = ref('')
const editPassword = ref('')
const editPasswordConfirm = ref('')
const savingUser = ref(false)

// 打开设置抽屉时（且为管理员）拉取用户列表
async function loadUsers() {
  if (!store.user?.is_admin) {
    users.value = []
    return
  }
  try {
    const data = await adminApi.listUsers()
    users.value = data.users
  } catch {
    users.value = []
  }
}

function startEditUser(u: UserDTO) {
  editingUser.value = u
  editNickname.value = u.nickname ?? ''
  editPassword.value = ''
  editPasswordConfirm.value = ''
}

function cancelEditUser() {
  editingUser.value = null
  editPassword.value = ''
  editPasswordConfirm.value = ''
}

async function saveEditUser() {
  if (!editingUser.value) return
  if (editPassword.value && editPassword.value !== editPasswordConfirm.value) {
    store.pushToast('两次输入的新密码不一致', 'error')
    return
  }
  savingUser.value = true
  try {
    await adminApi.updateUser(editingUser.value.id, {
      nickname: editNickname.value.trim(),
      new_password: editPassword.value || undefined,
      confirm_password: editPasswordConfirm.value || undefined,
    })
    // 回写本地列表，避免重新拉取
    const idx = users.value.findIndex((x) => x.id === editingUser.value!.id)
    if (idx >= 0) users.value[idx].nickname = editNickname.value.trim() || null
    cancelEditUser()
    store.pushToast('用户已更新')
  } catch (e) {
    const err = e as ApiError
    store.pushToast(err.message || '更新失败', 'error')
  } finally {
    savingUser.value = false
  }
}

async function confirmDeleteUser(u: UserDTO) {
  if (u.id === store.user?.id) {
    store.pushToast('不能删除管理员自身账号', 'error')
    return
  }
  if (!confirm(`确定删除用户「${u.nickname || u.username}」吗？\n该操作将一并删除其所有链接、分组与设置，且不可恢复。`)) {
    return
  }
  try {
    await adminApi.deleteUser(u.id)
    users.value = users.value.filter((x) => x.id !== u.id)
    store.pushToast('用户已删除')
  } catch (e) {
    const err = e as ApiError
    store.pushToast(err.message || '删除失败', 'error')
  }
}
</script>

<template>
  <AppModal :open="store.settingsDrawerOpen" box-class="max-w-3xl" @close="store.closeSettings()">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold">设置</h3>
      <button type="button" class="icon-btn" aria-label="关闭" @click="store.closeSettings()">
        <span class="text-xl leading-none">×</span>
      </button>
    </div>

    <div class="settings-body space-y-6 max-h-[70vh] overflow-y-auto px-3">
      <!-- 主题 -->
      <section>
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-medium">主题</h4>
          <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
            <span class="text-muted">显示删除</span>
            <WbSwitch v-model="showThemeDelete" />
          </label>
        </div>
        <ThemePicker :show-delete="showThemeDelete" @edit="startEditCt" />
        <div class="ct-row mt-4">
          <input v-model="ctName" maxlength="40" class="input input-bordered ct-name" :placeholder="editingCtId !== null ? '重命名' : '名称'" />
          <div class="ct-colors">
            <div class="color-cell">
              <input type="color" v-model="ctPrimary" class="color-input" aria-label="主色" />
              <span class="label-text">主色</span>
            </div>
            <div class="color-cell">
              <input type="color" v-model="ctSecondary" class="color-input" aria-label="辅色" />
              <span class="label-text">辅色</span>
            </div>
            <div class="color-cell">
              <input type="color" v-model="ctAccent" class="color-input" aria-label="强调" />
              <span class="label-text">强调</span>
            </div>
            <div class="color-cell">
              <input type="color" v-model="ctBackground" class="color-input" aria-label="背景" />
              <span class="label-text">背景</span>
            </div>
            <div class="color-cell">
              <input type="color" v-model="ctText" class="color-input" aria-label="文字" />
              <span class="label-text">文字</span>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-primary ct-add" @click="addCustomTheme">
            {{ editingCtId !== null ? '保存修改' : '添加配色' }}
          </button>
          <button v-if="editingCtId !== null" type="button" class="btn btn-sm" @click="cancelEditCt">取消编辑</button>
          <span v-if="editingCtId !== null" class="text-xs text-muted whitespace-nowrap">编辑中…</span>
        </div>
      </section>

      <!-- 外观 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">外观</h4>
        <!-- Dock 放大倍数：独占一行，滑块在左、备注在右 -->
        <div class="flex items-center gap-4 flex-wrap mb-4">
          <label class="flex items-center gap-3 flex-1 min-w-[260px] text-sm">
            <span class="whitespace-nowrap">Dock 放大倍数（{{ dockScale.toFixed(1) }}×）</span>
            <input type="range" min="1" max="2.5" step="0.1" v-model.number="dockScale" class="range flex-1" />
          </label>
          <span class="text-xs text-muted flex-1 min-w-[220px]">
            全局默认值。仅当某个分组在「分组设置」中未单独设定 Dock 放大倍数时生效（分组级设置优先级更高）。
          </span>
        </div>
        <!-- 两个数量字段同行 -->
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">
            <span>全部链接页每行数量（1~8）</span>
            <input type="number" min="1" max="8" v-model.number="linksPerRow" class="input input-bordered w-full" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>登录保持天数（1~365）</span>
            <input type="number" min="1" max="365" v-model.number="sessionDays" class="input input-bordered w-full" />
          </label>
        </div>
      </section>

      <!-- 总站默认进入页面 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">默认进入工作台</h4>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <WbSwitch v-model="defaultIsWorkbench" />
          <span>默认进入工作台页面（关闭则进入导航页面）</span>
        </label>
        <p class="text-xs text-muted mt-2">设置后，打开本站默认网址将直接进入所选页面；本次会话内手动切换的视图不受影响。</p>
      </section>

      <!-- 默认分组视图（仅导航设置页显示）：控制默认进入导航页面时显示的子视图 -->
      <section class="border-t pt-4" v-if="store.settingsContext === 'nav'">
        <h4 class="font-medium mb-3">默认分组视图</h4>
        <div class="select-wrap max-w-xs" :class="{ open: navViewOpen }" ref="navViewRef">
          <button type="button" class="select-trigger" @click="navViewOpen = !navViewOpen">
            <span>{{ navViewLabel }}</span>
            <AppIcon name="chevron-down" class="st-ic" :size="16" />
          </button>
          <div class="select-pop">
            <button
              v-for="o in navViewOptions"
              :key="o.value"
              type="button"
              class="select-opt"
              :class="{ selected: defaultNavView === o.value }"
              @click="pickNavView(o.value)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
        <p class="text-xs text-muted mt-2">设置后，默认进入导航页面时显示所选视图（分组视图 / 总览视图）；本次会话内手动切换的视图不受影响。</p>
      </section>

      <!-- 管理员专属模块：系统设置 / 站点 / 数据 / 用户管理（仅管理员可见） -->
      <template v-if="store.user?.is_admin">
      <!-- 系统设置（站点品牌） -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">系统设置</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-sm mb-1">站点名称</label>
            <input v-model="siteName" maxlength="64" class="input input-bordered w-full" placeholder="导航栏品牌文字，如 Eiger" />
          </div>
          <div>
            <label class="block text-sm mb-1">站点主标题</label>
            <input v-model="siteTitle" maxlength="128" class="input input-bordered w-full" placeholder="浏览器标签标题，留空则回退站点名称" />
          </div>
          <div>
            <label class="block text-sm mb-1">副标题</label>
            <input v-model="siteSubtitle" maxlength="128" class="input input-bordered w-full" placeholder="品牌名下方的小字标语（可选）" />
          </div>
          <div>
            <label class="block text-sm mb-1">站点 Logo</label>
            <input v-model="siteLogo" maxlength="512" class="input input-bordered w-full" placeholder="图片 URL，如 https://…/logo.png（留空用默认图标）" />
            <p v-if="siteLogo" class="text-xs text-muted mt-1 flex items-center gap-2">
              <span>预览：</span>
              <img :src="siteLogo" alt="logo 预览" class="wb-logo-prev" />
            </p>
          </div>
        </div>
      </section>

      <!-- 字体设置（管理员） -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">字体设置</h4>
        <div class="space-y-3">
          <label class="flex flex-col gap-1 text-sm">
            <span>英文 / 数字字体</span>
            <input v-model="fontSans" class="input input-bordered w-full" placeholder="如 Inter, system-ui, sans-serif" />
            <small class="text-xs text-muted">拉丁字母与数字优先使用；多个字体用逗号分隔，浏览器按字形自动回退。</small>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>中文字体</span>
            <input v-model="fontCjk" class="input input-bordered w-full" placeholder="如 'Noto Sans SC', 'PingFang SC', sans-serif" />
            <small class="text-xs text-muted">中文优先使用；留空则中文回退到系统默认字体。</small>
          </label>
          <p class="text-xs text-muted">最终渲染顺序为「英文/数字字体 → 中文字体 → 系统兜底」。修改后保存即全站生效，无需刷新。</p>
        </div>
      </section>

      <!-- 站点 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-2">站点</h4>
        <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <WbSwitch v-model="allowRegisterLocal" />
            <span>开放新用户注册</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <WbSwitch v-model="openInNew" />
            <span>链接默认新窗口打开</span>
          </label>
        </div>
      </section>

      <!-- 数据 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">数据</h4>
        <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm" @click="onImportClick">导入</button>
      <button type="button" class="btn btn-sm" @click="store.exportData('json')">导出 JSON</button>
      <button type="button" class="btn btn-sm" @click="store.exportData('xlsx')">导出 Excel</button>
      <button type="button" class="btn btn-sm" @click="store.exportData('html')">导出 HTML</button>
      <button type="button" class="btn btn-sm" @click="store.backupData()">全量备份</button>
      <button type="button" class="btn btn-sm" @click="onRestoreClick">还原备份</button>
    </div>
  </section>

      <!-- 用户管理 -->
      <section class="border-t pt-4">
        <h4 class="font-medium mb-3">用户管理</h4>
        <div class="space-y-1">
          <div
            v-for="u in users"
            :key="u.id"
            class="flex items-center justify-between gap-3 py-2 border-b last:border-0"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="avatar avatar-sm" v-if="u.avatar">
                <img :src="u.avatar" :alt="u.nickname || u.username" />
              </div>
              <AppIcon v-else name="user" :size="16" />
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ u.nickname || u.username }}</div>
                <div class="text-xs text-muted">
                  @{{ u.username }}<span
                    v-if="u.is_admin"
                    class="ml-1 px-1 rounded bg-primary/10 text-primary text-[10px]"
                  >管理员</span>
                </div>
              </div>
            </div>
            <div class="flex gap-2 shrink-0">
              <button type="button" class="btn btn-sm" @click="startEditUser(u)">编辑</button>
              <button
                type="button"
                class="btn btn-sm btn-error"
                :disabled="u.id === store.user?.id"
                @click="confirmDeleteUser(u)"
              >删除</button>
            </div>
          </div>
          <p v-if="users.length === 0" class="text-xs text-muted py-2">暂无其他用户。</p>
        </div>

        <!-- 编辑面板（内联展开）：仅管理员可改他人昵称 / 重置密码 -->
        <div v-if="editingUser" class="mt-3 p-3 rounded border space-y-2">
          <div class="font-medium text-sm">编辑用户：{{ editingUser.nickname || editingUser.username }}</div>
          <label class="flex flex-col gap-1 text-sm">
            <span>昵称</span>
            <input v-model="editNickname" maxlength="80" class="input input-bordered w-full" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>重置密码（留空则不修改）</span>
            <input v-model="editPassword" type="password" maxlength="64" class="input input-bordered w-full" placeholder="新密码（≥6 位）" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>确认新密码</span>
            <input v-model="editPasswordConfirm" type="password" maxlength="64" class="input input-bordered w-full" placeholder="再次输入新密码" />
          </label>
          <div class="flex gap-2">
            <button type="button" class="btn btn-sm btn-primary" :disabled="savingUser" @click="saveEditUser">保存</button>
            <button type="button" class="btn btn-sm" @click="cancelEditUser">取消</button>
          </div>
        </div>
      </section>
      </template>
    </div>

    <div class="settings-footer">
      <button type="button" class="btn" @click="cancelEdit">取消</button>
      <button type="button" class="btn btn-primary" @click="saveAll">保存</button>
    </div>
  </AppModal>
</template>
