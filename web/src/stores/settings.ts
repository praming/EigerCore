import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi, themesApi } from '@/api'
import { applyTheme } from '@/lib/theme'
import { useUiStore } from './ui'
import { useAuthStore } from './auth'
import type { ApiError, CustomThemeDTO, SiteSettingsDTO, UserSettingsDTO } from '@/types/api'

/**
 * Settings store —— 用户级设置、主题 / 自定义配色、资料、注册开关。
 * 主题色是 UserSettings.theme 的派生，故与设置同店；logout/用户身份归 auth 店。
 * 写操作统一通过 useUiStore 抛轻提示；修改昵称/头像时同步回写 auth 店的 user。
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettingsDTO | null>(null)
  const customThemes = ref<CustomThemeDTO[]>([])
  /** 用户已隐藏（从主题选择器移除）的内置主题名清单 */
  const hiddenBuiltinThemes = ref<string[]>([])
  /** 站点级「开放注册」开关（本地镜像，POST 后乐观更新） */
  const allowRegister = ref<boolean>(true)
  /** 站点级品牌（全站统一一套，公开可读 / 登录可写） */
  const siteSettings = ref<SiteSettingsDTO | null>(null)
  /** 设置抽屉开关 */
  const settingsDrawerOpen = ref<boolean>(false)
  /** 设置抽屉上下文：'workbench' 工作台主设置页 / 'nav' 导航主设置页（默认 nav）；决定显示哪些区块 */
  const settingsContext = ref<'workbench' | 'nav'>('nav')
  /** 个人中心弹窗开关（顶栏点击头像/昵称打开；含资料与修改密码） */
  const profileOpen = ref<boolean>(false)

  const ui = useUiStore()
  const auth = useAuthStore()

  function openSettings(context?: 'workbench' | 'nav') {
    if (context) settingsContext.value = context
    settingsDrawerOpen.value = true
    // 打开时确保自定义配色已拉取，供 ThemePicker 与 custom:N 解析使用
    if (customThemes.value.length === 0) loadCustomThemes()
  }
  function closeSettings() {
    settingsDrawerOpen.value = false
  }
  function openProfile() {
    profileOpen.value = true
  }
  function closeProfile() {
    profileOpen.value = false
  }

  function applyCurrentTheme() {
    if (settings.value?.theme) applyTheme(settings.value.theme, customThemes.value)
  }

  async function setTheme(theme: string) {
    try {
      await settingsApi.setTheme(theme)
      if (settings.value) settings.value.theme = theme
      applyTheme(theme, customThemes.value)
      ui.pushToast('主题已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '主题更新失败', 'error')
    }
  }

  async function updateSettings(payload: {
    links_per_row?: number
    dock_scale?: number
    session_days?: number
    open_in_new?: boolean
  }) {
    try {
      await settingsApi.updateSystem(payload)
      if (settings.value) Object.assign(settings.value, payload)
      ui.pushToast('设置已保存')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '保存失败', 'error')
    }
  }

  /** 将站点字体栈写入文档根，使其作为 body 字体变量的取值。缺省回退内置默认值。 */
  function applySiteFonts(ss: SiteSettingsDTO | null) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sans = (ss?.font_sans || '').trim() || "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    const cjk = (ss?.font_cjk || '').trim() || "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    root.style.setProperty('--font-sans', sans)
    root.style.setProperty('--font-cjk', cjk)
  }

  /** 拉取站点级品牌（公开接口，无需登录）。失败静默，保持 null 由 TopBar 回退默认值。 */
  async function loadSiteSettings() {
    try {
      siteSettings.value = await settingsApi.getSite()
      applySiteFonts(siteSettings.value)
    } catch {
      siteSettings.value = null
      applySiteFonts(null)
    }
  }

  /** 写入站点级品牌（登录可写），成功后乐观更新本地镜像，驱动顶栏/文档标题即时刷新。 */
  async function updateSite(payload: {
    site_name?: string
    site_title?: string
    site_subtitle?: string
    site_logo?: string
    font_sans?: string
    font_cjk?: string
  }) {
    try {
      await settingsApi.updateSite(payload)
      if (siteSettings.value) Object.assign(siteSettings.value, payload)
      // 字体变更即时生效（写入文档根变量）
      if (payload.font_sans !== undefined || payload.font_cjk !== undefined) applySiteFonts(siteSettings.value)
      ui.pushToast('站点品牌已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '保存失败', 'error')
    }
  }

  async function setHome(defaultHome: string) {
    try {
      await settingsApi.setHome(defaultHome)
      if (settings.value) settings.value.default_home = defaultHome === 'all' ? null : defaultHome
      ui.pushToast('默认首页已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '保存失败', 'error')
    }
  }

  async function setDefaultView(defaultView: string) {
    try {
      await settingsApi.setView(defaultView)
      if (settings.value) settings.value.default_view = defaultView
      ui.pushToast('默认进入页面已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '保存失败', 'error')
    }
  }

  async function setNavView(defaultNavView: string) {
    try {
      await settingsApi.setNavView(defaultNavView)
      if (settings.value) settings.value.default_nav_view = defaultNavView
      ui.pushToast('默认分组视图已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '保存失败', 'error')
    }
  }

  async function setRegisterOpen(open: boolean) {
    allowRegister.value = open
    try {
      await settingsApi.setRegisterOpen(open)
    } catch (e) {
      const err = e as ApiError
      allowRegister.value = !open // 回滚
      ui.pushToast(err.message || '操作失败', 'error')
    }
  }

  async function updateProfile(nickname: string, avatar: string) {
    try {
      await settingsApi.updateProfile(nickname, avatar)
      // 同步回写 auth 店的当前用户，避免顶栏头像/昵称残留旧值
      if (auth.user) {
        auth.user.nickname = nickname || null
        auth.user.avatar = avatar || null
      }
      ui.pushToast('资料已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '更新失败', 'error')
    }
  }

  /** 修改本人密码：旧密码校验 + 新密码强度与一致性由后端把关，前端仅透传。 */
  async function changePassword(old_password: string, new_password: string, confirm_password: string) {
    await settingsApi.changePassword(old_password, new_password, confirm_password)
    ui.pushToast('密码已修改')
  }

  async function loadSettings() {
    try {
      const s = await settingsApi.get()
      settings.value = s
      hiddenBuiltinThemes.value = s.hidden_builtin_themes ?? []
      // 回显站点级「开放注册」开关，否则刷新后会回退到默认值（true）
      if (typeof s.allow_register === 'boolean') allowRegister.value = s.allow_register
    } catch {
      settings.value = null
    }
  }

  async function loadCustomThemes() {
    try {
      const data = await themesApi.list()
      customThemes.value = data.themes
    } catch {
      customThemes.value = []
    }
  }

  async function createCustomTheme(input: {
    name: string
    primary: string
    secondary: string
    background: string
    text: string
    accent: string
  }) {
    try {
      await settingsApi.createCustomTheme(input)
      await loadCustomThemes()
      ui.pushToast('自定义配色已创建')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '创建失败', 'error')
    }
  }

  async function deleteCustomTheme(id: number) {
    try {
      await settingsApi.deleteCustomTheme(id)
      customThemes.value = customThemes.value.filter((t) => t.id !== id)
      ui.pushToast('自定义配色已删除')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '删除失败', 'error')
    }
  }

  async function updateCustomTheme(
    id: number,
    input: {
      name?: string
      primary?: string
      secondary?: string
      background?: string
      text?: string
      accent?: string
    }
  ) {
    try {
      await settingsApi.updateCustomTheme(id, input)
      await loadCustomThemes()
      // 若修改的是当前激活主题，重新应用以即时生效
      if (settings.value?.theme === `custom:${id}`) {
        applyCurrentTheme()
      }
      ui.pushToast('自定义配色已更新')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '更新失败', 'error')
    }
  }

  /** 隐藏一个内置主题（从选择器移除），并持久化到后端 */
  async function deleteBuiltinTheme(name: string) {
    const next = Array.from(new Set([...hiddenBuiltinThemes.value, name]))
    try {
      await settingsApi.setHiddenBuiltinThemes(next)
      hiddenBuiltinThemes.value = next
      // 若隐藏的正是当前激活主题，则回退浅色（选择器已看不见，避免仍生效）
      if (settings.value?.theme === name) {
        await setTheme('light')
      }
      ui.pushToast('已隐藏内置主题')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '操作失败', 'error')
    }
  }

  /** 恢复一个被隐藏的内置主题 */
  async function restoreBuiltinTheme(name: string) {
    const next = hiddenBuiltinThemes.value.filter((t) => t !== name)
    try {
      await settingsApi.setHiddenBuiltinThemes(next)
      hiddenBuiltinThemes.value = next
      ui.pushToast('已恢复内置主题')
    } catch (e) {
      const err = e as ApiError
      ui.pushToast(err.message || '操作失败', 'error')
    }
  }

  return {
    settings,
    customThemes,
    hiddenBuiltinThemes,
    allowRegister,
    siteSettings,
    settingsDrawerOpen,
    settingsContext,
    profileOpen,
    openSettings,
    closeSettings,
    openProfile,
    closeProfile,
    setTheme,
    applyCurrentTheme,
    updateSettings,
    loadSiteSettings,
    updateSite,
    setHome,
    setDefaultView,
    setNavView,
    setRegisterOpen,
    updateProfile,
    changePassword,
    loadSettings,
    loadCustomThemes,
    createCustomTheme,
    deleteCustomTheme,
    updateCustomTheme,
    deleteBuiltinTheme,
    restoreBuiltinTheme,
  }
})
