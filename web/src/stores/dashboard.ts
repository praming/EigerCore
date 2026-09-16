import { defineStore } from 'pinia'
import { storeToRefs } from 'pinia'
import { ref, computed } from 'vue'
import { categoriesApi, groupsApi, overviewApi, dataApi, linksApi } from '@/api'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import type {
  CategoryItemDTO,
  GroupDTO,
  GroupFormInput,
  LinkDTO,
  LinkFormInput,
  OverviewSectionDTO,
  UngroupedDTO,
} from '@/types/api'

export type ViewMode = 'nav' | 'overview'

export type { Toast } from './ui'

/** 删除二次确认的目标 */
export interface DeleteTarget {
  kind: 'link' | 'group'
  id: number
  name: string
}

// Phase 4：把原单体 store 拆分为 auth / settings / ui 三个独立 store，
// 本店只负责「数据 / 视图 / 弹窗 / 写操作」，并在 return 中重新导出三个子店的状态与动作，
// 因此既有 18 个组件无需改动（store.xxx 的访问方式保持不变）。
export const useDashboardStore = defineStore('dashboard', () => {
  // --- 子店实例（组合而非内联，便于独立测试与复用）---
  const authStore = useAuthStore()
  const settingsStore = useSettingsStore()
  const uiStore = useUiStore()

  // ============== 本地：数据 / 视图状态 ==============
  const categories = ref<CategoryItemDTO[]>([])
  const currentCategory = ref<string>('nav')
  const view = ref<ViewMode>('nav')
  const groups = ref<GroupDTO[]>([])
  const ungrouped = ref<UngroupedDTO | null>(null)
  const sections = ref<OverviewSectionDTO[]>([])
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const search = ref<string>('')
  const editMode = ref<boolean>(false)
  /** 批量多选：当前选中的链接 id 集合（仅编辑模式生效） */
  const selectedIds = ref<number[]>([])
  /** 滚动联动（总览视图）：当前处于视口中心的分段 id，供侧栏高亮 */
  const activeSectionId = ref<number | null>(null)
  /** 分组视图：当前展示的分组 id（0=未分组）；点击侧栏分组时切换内容，而非滚动定位 */
  const navGroupId = ref<number | null>(null)

  // ---- 弹窗与写操作状态 ----
  /** 链接弹窗：editingLink 为 null 表示「新增」，否则为「编辑」 */
  const linkModalOpen = ref<boolean>(false)
  const editingLink = ref<LinkDTO | null>(null)
  /** 新增链接时预设的所属分组（对应 Jinja 的 ACTIVE_GROUP 预填逻辑） */
  const presetGroupId = ref<number>(0)
  /** 分组弹窗：editingGroup 为 null 表示「新建」 */
  const groupModalOpen = ref<boolean>(false)
  const editingGroup = ref<GroupDTO | null>(null)
  /** 删除二次确认目标；null 表示未打开 */
  const deleteTarget = ref<DeleteTarget | null>(null)
  /** 提交中（禁用按钮、防重复提交） */
  const saving = ref<boolean>(false)
  /** 后端下发的逐字段校验错误，供弹窗内联回显 */
  const formErrors = ref<Record<string, string[]>>({})

  // ============== 数据加载 ==============
  async function loadCategories() {
    try {
      const data = await categoriesApi.list()
      // 「工作台」为纯前端实现的视图（零后端数据依赖）。后端 app/categories.py
      // 中 workbench.enabled=False（未上线的占位灰显），这里强制保证该分类存在且
      // 可用，覆盖后端占位禁用态，确保顶栏按钮可点击。
      const items = data.items.slice()
      const wbIdx = items.findIndex((c) => c.id === 'workbench')
      const wb = { id: 'workbench', name: '工作台', icon: 'layout-dashboard', order: 999, enabled: true }
      if (wbIdx === -1) items.push(wb)
      else {
        items[wbIdx] = { ...items[wbIdx], ...wb }
        // 顶栏分类顺序：工作台置于最前（导航紧随其后），与默认进入页（导航）解耦
        items.splice(wbIdx, 1)
        items.unshift(wb)
      }
      // 删除以前预留的【资讯】选项（后端 categories.py 中的 news 占位，未上线）
      categories.value = items.filter((c) => c.id !== 'news')
      const cur = items.find((c) => c.id === data.current && c.enabled)
      const firstEnabled = items.find((c) => c.enabled)
      currentCategory.value = (cur || firstEnabled)?.id ?? 'nav'
    } catch {
      categories.value = []
    }
  }

  /** 只拉取分组 + 未分组（侧栏依赖它；总览视图下也需要保持同步） */
  async function loadGroups() {
    const data = await groupsApi.list(currentCategory.value)
    groups.value = data.groups
    ungrouped.value = data.ungrouped
  }

  async function loadDashboard() {
    // 工作台为纯前端视图，跳过一切后端数据加载
    if (isWorkbench.value) {
      loading.value = false
      error.value = null
      groups.value = []
      ungrouped.value = null
      sections.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      if (view.value === 'nav') {
        await loadGroups()
        ensureNavGroup()
      } else {
        const data = await overviewApi.sections(currentCategory.value)
        sections.value = data.sections
      }
    } catch (e: any) {
      error.value = e?.message || '加载失败'
      groups.value = []
      ungrouped.value = null
      sections.value = []
    } finally {
      loading.value = false
    }
  }

  async function init() {
    // 协调子店：认证、分类、用户设置、自定义配色、应用主题，最后加载看板数据
    await Promise.all([
      authStore.loadUser(),
      loadCategories(),
      settingsStore.loadSettings(),
      // 站点级品牌（公开接口）：无论登录与否均加载，供顶栏品牌/文档标题即时显示
      settingsStore.loadSiteSettings(),
    ])
    await settingsStore.loadCustomThemes()
    settingsStore.applyCurrentTheme()
    // 应用「总站默认进入页面」：default_view='workbench' 时直接进入工作台视图
    if (settingsStore.settings?.default_view === 'workbench') {
      currentCategory.value = 'workbench'
    }
    // 应用「导航分类默认进入的子视图」：进入导航分类时，按 default_nav_view 决定默认是分组视图还是总览视图
    applyDefaultNavView()
    await loadDashboard()
  }

  function setView(v: ViewMode) {
    if (view.value === v) return
    view.value = v
    clearSelection()
    activeSectionId.value = null
    loadDashboard()
  }

  /** 应用「导航分类默认进入的子视图」：进入导航分类时，按 default_nav_view 决定默认是分组视图还是总览视图。
   *  非导航分类直接返回；本店（含 default_view='workbench' 时）进入导航分类也必须应用，否则默认不生效。 */
  function applyDefaultNavView() {
    if (currentCategory.value !== 'nav') return
    const nv = (settingsStore.settings?.default_nav_view as ViewMode) || 'nav'
    if (nv === 'overview' || nv === 'nav') view.value = nv
  }

  /** 分组视图：保证当前选中的分组有效（首次进入或分组变动后默认选第一个） */
  function ensureNavGroup() {
    const ids: number[] = groups.value.map((g) => g.id)
    if (ungrouped.value && (ungrouped.value.count ?? 0) > 0) ids.unshift(0)
    if (navGroupId.value === null || !ids.includes(navGroupId.value)) {
      navGroupId.value = ids.length ? ids[0] : null
    }
  }

  /** 分组视图：切换当前展示的分组（侧栏点击 → 换内容，而非滚动定位） */
  function setNavGroup(id: number) {
    navGroupId.value = id
    clearSelection()
  }

  function setCategory(c: string) {
    if (currentCategory.value === c) return
    currentCategory.value = c
    clearSelection()
    activeSectionId.value = null
    // 进入导航分类时，按 default_nav_view 应用默认子视图（分组视图 / 总览视图）
    applyDefaultNavView()
    loadDashboard()
  }

  function setSearch(q: string) {
    search.value = q
  }

  function toggleEdit() {
    editMode.value = !editMode.value
    // 退出编辑模式时清空多选，避免遗留勾选态
    if (!editMode.value) selectedIds.value = []
  }

  // ------------------------------------------------------------------
  // 批量多选（编辑模式下卡片左上勾选框联动）
  // ------------------------------------------------------------------
  function isSelected(id: number): boolean {
    return selectedIds.value.includes(id)
  }
  function toggleSelect(id: number) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((x) => x !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }
  /** 全选 / 设定选中集合（传入当前视图可见链接 id 列表） */
  function setSelection(ids: number[]) {
    selectedIds.value = [...new Set(ids)]
  }
  function clearSelection() {
    selectedIds.value = []
  }

  // ------------------------------------------------------------------
  // 拖拽排序 / 批量
  // ------------------------------------------------------------------
  /** 拖拽后：把给定分组的新 id 顺序应用到本地 store 并异步落库 */
  function findLinksContainer(groupId: number): { links: LinkDTO[] } | null {
    if (view.value === 'nav') {
      if (groupId === 0) return ungrouped.value as unknown as { links: LinkDTO[] }
      const g = groups.value.find((x) => x.id === groupId)
      return g ? (g as unknown as { links: LinkDTO[] }) : null
    }
    const s = sections.value.find((x) => x.id === groupId)
    return s ? (s as unknown as { links: LinkDTO[] }) : null
  }

  async function reorderGroups(newIds: number[]) {
    const snapshot = groups.value
    groups.value = newIds
      .map((id) => snapshot.find((g) => g.id === id))
      .filter((g): g is GroupDTO => Boolean(g))
    try {
      await groupsApi.updateOrder(newIds)
    } catch (e) {
      groups.value = snapshot
      handleMutationError(e)
    }
  }

  async function reorderLinks(groupId: number, newIds: number[]) {
    const container = findLinksContainer(groupId)
    if (!container) return
    const snapshot = container.links
    const prev = snapshot.map((l) => l.id)
    container.links = newIds
      .map((id) => snapshot.find((l) => l.id === id))
      .filter((l): l is LinkDTO => Boolean(l))
    try {
      await linksApi.updateOrder(newIds)
    } catch (e) {
      container.links = prev
        .map((id) => snapshot.find((l) => l.id === id))
        .filter((l): l is LinkDTO => Boolean(l))
      handleMutationError(e)
    }
  }

  async function batchMove(groupId: number) {
    if (selectedIds.value.length === 0) return
    const ids = [...selectedIds.value]
    try {
      await linksApi.batch('move', ids, groupId)
      uiStore.pushToast(`已移动 ${ids.length} 个链接`)
      clearSelection()
      await refreshAfterMutation()
    } catch (e) {
      handleMutationError(e)
    }
  }

  async function batchDelete() {
    if (selectedIds.value.length === 0) return
    const ids = [...selectedIds.value]
    try {
      await linksApi.batch('delete', ids)
      uiStore.pushToast(`已删除 ${ids.length} 个链接`)
      clearSelection()
      await refreshAfterMutation()
    } catch (e) {
      handleMutationError(e)
    }
  }

  function setActiveSection(id: number | null) {
    activeSectionId.value = id
  }

  // ------------------------------------------------------------------
  // 弹窗开合（对应 Jinja 的 openAdd / openEdit / openAddGroup / openEditGroup / openDelete*）
  // ------------------------------------------------------------------
  function openAddLink(groupId = 0) {
    formErrors.value = {}
    editingLink.value = null
    presetGroupId.value = groupId
    linkModalOpen.value = true
  }
  function openEditLink(link: LinkDTO) {
    formErrors.value = {}
    editingLink.value = link
    presetGroupId.value = link.group_id ?? 0
    linkModalOpen.value = true
  }
  function closeLinkModal() {
    linkModalOpen.value = false
    editingLink.value = null
    formErrors.value = {}
  }
  function openAddGroup() {
    formErrors.value = {}
    editingGroup.value = null
    groupModalOpen.value = true
  }
  function openEditGroup(group: GroupDTO) {
    formErrors.value = {}
    editingGroup.value = group
    groupModalOpen.value = true
  }
  function closeGroupModal() {
    groupModalOpen.value = false
    editingGroup.value = null
    formErrors.value = {}
  }
  function askDeleteLink(link: LinkDTO) {
    deleteTarget.value = { kind: 'link', id: link.id, name: link.title }
  }
  function askDeleteGroup(group: GroupDTO) {
    deleteTarget.value = { kind: 'group', id: group.id, name: group.name }
  }
  function closeDelete() {
    deleteTarget.value = null
  }

  // ------------------------------------------------------------------
  // 写操作：提交成功后刷新当前视图（总览视图下额外同步分组列表以保证侧栏一致）
  // ------------------------------------------------------------------
  async function refreshAfterMutation() {
    if (view.value === 'nav') {
      await loadDashboard()
      return
    }
    await Promise.all([loadGroups().catch(() => {}), loadDashboard()])
  }

  /** 统一异常处理：把 ApiError 的逐字段错误落到 formErrors，并弹出错误提示 */
  function handleMutationError(e: unknown) {
    const err = e as { errors?: Record<string, string[]>; message?: string }
    formErrors.value = err?.errors ?? {}
    uiStore.pushToast(err?.message || '操作失败', 'error')
  }

  /** 提交链接（editingLink 为空则新增，否则编辑）。返回是否成功。 */
  async function submitLink(input: LinkFormInput): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    formErrors.value = {}
    try {
      const res = editingLink.value
        ? await linksApi.update(editingLink.value.id, input)
        : await linksApi.create(input)
      closeLinkModal()
      await refreshAfterMutation()
      uiStore.pushToast(res.msg || '已保存。')
      return true
    } catch (e) {
      handleMutationError(e)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 提交分组（editingGroup 为空则新建，否则编辑）。返回是否成功。 */
  async function submitGroup(input: GroupFormInput): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    formErrors.value = {}
    try {
      const res = editingGroup.value
        ? await groupsApi.update(editingGroup.value.id, input)
        : await groupsApi.create(input)
      closeGroupModal()
      await refreshAfterMutation()
      uiStore.pushToast(res.msg || '已保存。')
      return true
    } catch (e) {
      handleMutationError(e)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 执行删除（按 deleteTarget.kind 分派）。返回是否成功。 */
  async function confirmDelete(): Promise<boolean> {
    const target = deleteTarget.value
    if (!target || saving.value) return false
    saving.value = true
    try {
      const res =
        target.kind === 'link'
          ? await linksApi.remove(target.id)
          : await groupsApi.remove(target.id)
      closeDelete()
      await refreshAfterMutation()
      uiStore.pushToast(res.msg || '已删除。')
      return true
    } catch (e) {
      handleMutationError(e)
      return false
    } finally {
      saving.value = false
    }
  }

  // ------------------------------------------------------------------
  // 数据管理（导入 / 导出 / 备份 / 还原）—— 属数据操作，归本店
  // ------------------------------------------------------------------
  async function importData(file: File) {
    try {
      await dataApi.importData(file)
      uiStore.pushToast('导入完成，正在刷新…')
      await refreshAfterMutation()
    } catch (e) {
      const err = e as { message?: string }
      uiStore.pushToast(err?.message || '导入失败', 'error')
    }
  }

  function exportData(fmt: 'json' | 'xlsx' | 'html') {
    window.location.href = dataApi.exportUrl(fmt)
  }

  function backupData() {
    window.location.href = dataApi.backupUrl()
  }

  async function restoreData(file: File) {
    try {
      await dataApi.restoreData(file)
      uiStore.pushToast('还原完成，正在刷新…')
      await refreshAfterMutation()
    } catch (e) {
      const err = e as { message?: string }
      uiStore.pushToast(err?.message || '还原失败', 'error')
    }
  }

  const groupOptions = computed(() => [
    { value: 0, label: '未分组' },
    ...groups.value.map((g) => ({ value: g.id, label: g.name })),
  ])

  const isEmpty = computed(() => {
    if (!authStore.authed) return false
    if (view.value === 'nav') {
      const hasLinks =
        groups.value.some((g) => (g.links?.length ?? 0) > 0) ||
        (ungrouped.value?.count ?? 0) > 0
      return !hasLinks
    }
    return sections.value.length === 0 || sections.value.every((s) => s.links.length === 0)
  })

  /** 是否处于「工作台」分类（前端合成，纯前端视图，不请求后端数据） */
  const isWorkbench = computed(() => currentCategory.value === 'workbench')

  /** 批量条是否可见：编辑模式且已勾选至少一个 */
  const batchBarVisible = computed(() => editMode.value && selectedIds.value.length > 0)
  const selectedCount = computed(() => selectedIds.value.length)
  /** 当前视图下所有可见链接 id（「全选」用） */
  const visibleLinkIds = computed<number[]>(() => {
    const ids: number[] = []
    if (view.value === 'nav') {
      groups.value.forEach((g) => g.links?.forEach((l) => ids.push(l.id)))
      ungrouped.value?.links?.forEach((l) => ids.push(l.id))
    } else {
      sections.value.forEach((s) => s.links.forEach((l) => ids.push(l.id)))
    }
    return ids
  })

  return {
    // ---- 认证（来自 auth 店）----
    ...storeToRefs(authStore),
    loadUser: authStore.loadUser,
    logout: authStore.logout,

    // ---- 设置 / 主题 / 资料（来自 settings 店）----
    ...storeToRefs(settingsStore),
    setTheme: settingsStore.setTheme,
    applyCurrentTheme: settingsStore.applyCurrentTheme,
    updateSettings: settingsStore.updateSettings,
    loadSiteSettings: settingsStore.loadSiteSettings,
    updateSite: settingsStore.updateSite,
    setHome: settingsStore.setHome,
    setDefaultView: settingsStore.setDefaultView,
    setNavView: settingsStore.setNavView,
    setRegisterOpen: settingsStore.setRegisterOpen,
    updateProfile: settingsStore.updateProfile,
    loadCustomThemes: settingsStore.loadCustomThemes,
    createCustomTheme: settingsStore.createCustomTheme,
    deleteCustomTheme: settingsStore.deleteCustomTheme,
    updateCustomTheme: settingsStore.updateCustomTheme,
    deleteBuiltinTheme: settingsStore.deleteBuiltinTheme,
    restoreBuiltinTheme: settingsStore.restoreBuiltinTheme,
    openSettings: settingsStore.openSettings,
    closeSettings: settingsStore.closeSettings,

    // ---- UI 轻提示（来自 ui 店）----
    ...storeToRefs(uiStore),
    pushToast: uiStore.pushToast,
    dismissToast: uiStore.dismissToast,

    // ---- 本地：数据 / 视图 / 弹窗 / 写操作 ----
    categories,
    currentCategory,
    view,
    navGroupId,
    groups,
    ungrouped,
    sections,
    loading,
    error,
    search,
    editMode,
    selectedIds,
    selectedCount,
    batchBarVisible,
    visibleLinkIds,
    isSelected,
    activeSectionId,
    isEmpty,
    isWorkbench,
    groupOptions,
    init,
    loadCategories,
    loadGroups,
    loadDashboard,
    setView,
    setNavGroup,
    setCategory,
    setSearch,
    toggleEdit,
    setSelection,
    clearSelection,
    toggleSelect,
    reorderGroups,
    reorderLinks,
    batchMove,
    batchDelete,
    setActiveSection,
    linkModalOpen,
    editingLink,
    presetGroupId,
    groupModalOpen,
    editingGroup,
    deleteTarget,
    saving,
    formErrors,
    openAddLink,
    openEditLink,
    closeLinkModal,
    openAddGroup,
    openEditGroup,
    closeGroupModal,
    askDeleteLink,
    askDeleteGroup,
    closeDelete,
    submitLink,
    submitGroup,
    confirmDelete,
    importData,
    exportData,
    backupData,
    restoreData,
    refreshAfterMutation,
  }
})
