import { apiGet, apiPost, apiPostForm, apiDelete, toFormData } from './request'
import type {
  UserDTO,
  GroupDTO,
  UngroupedDTO,
  LinkDTO,
  OverviewSectionDTO,
  CategoryItemDTO,
  UserSettingsDTO,
  CustomThemeDTO,
  SiteSettingsDTO,
  AuthMePayload,
  LoginPayload,
  CategoriesPayload,
  GroupsPayload,
  LinksPayload,
  OverviewPayload,
  SettingsPayload,
  ThemesPayload,
  LinkFormInput,
  GroupFormInput,
  LinkMutationPayload,
  GroupMutationPayload,
  DeletePayload,
  FetchTitlePayload,
} from '@/types/api'

// 认证
export const authApi = {
  me: () => apiGet<AuthMePayload>('/api/auth/me'),
  login: (username: string, password: string, remember = true) =>
    apiPost<LoginPayload>('/api/login', { username, password, remember }),
  logout: () => apiPost<Record<string, never>>('/api/logout'),
}

// 分类（顶层模块：nav / workbench / news）
export const categoriesApi = {
  list: (cat?: string) =>
    apiGet<CategoriesPayload>(cat ? `/api/categories?cat=${encodeURIComponent(cat)}` : '/api/categories'),
}

// 分组视图：分组 + 嵌套链接 + 未分组段
export const groupsApi = {
  list: (category = 'nav') =>
    apiGet<GroupsPayload>(`/api/groups?category=${encodeURIComponent(category)}`),
  byId: (groupId: number, category = 'nav') =>
    apiGet<LinksPayload>(`/api/links?group=${groupId}&category=${encodeURIComponent(category)}`),

  // ---- 写操作：复用 Jinja 端同一批端点，SPA 通过 X-Requested-With 头拿到 JSON 回包 ----
  create: (input: GroupFormInput) =>
    apiPostForm<GroupMutationPayload>('/group/add', toFormData({ ...input })),
  update: (groupId: number, input: GroupFormInput) =>
    apiPostForm<GroupMutationPayload>(`/group/${groupId}/edit`, toFormData({ ...input })),
  remove: (groupId: number) =>
    apiPostForm<DeletePayload>(`/group/${groupId}/delete`, toFormData({})),
  /** 编辑模式下侧栏分组拖拽重排：提交分组 id 的新顺序 */
  updateOrder: (order: number[]) =>
    apiPost<{ status: string }>('/group/update-order', { order }),
}

// 链接写操作（读取走 groupsApi.list / byId）
export const linksApi = {
  create: (input: LinkFormInput) =>
    apiPostForm<LinkMutationPayload>('/link/add', toFormData({ ...input })),
  update: (linkId: number, input: LinkFormInput) =>
    apiPostForm<LinkMutationPayload>(`/link/${linkId}/edit`, toFormData({ ...input })),
  remove: (linkId: number) =>
    apiPostForm<DeletePayload>(`/link/${linkId}/delete`, toFormData({})),
  /** 由 URL 抓取目标站点 <title>（后端做 SSRF 防护与字节上限） */
  fetchTitle: (url: string) => apiPost<FetchTitlePayload>('/link/fetch-title', { url }),
  /** 卡片墙内拖拽重排：提交「当前分组 / 当前段」链接 id 的新顺序 */
  updateOrder: (order: number[]) =>
    apiPost<{ status: string }>('/update-order', { order }),
  /** 批量操作：delete 删除选定链接 / move 移动到指定分组（group_id=0 表示未分组） */
  batch: (action: 'delete' | 'move', ids: number[], group_id?: number) =>
    apiPost<{ status: string }>('/batch', { action, ids, group_id: group_id ?? 0 }),
}

// 总览视图：分段时间片
export const overviewApi = {
  sections: (category = 'nav') =>
    apiGet<OverviewPayload>(`/api/overview-sections?category=${encodeURIComponent(category)}`),
}

export interface CustomThemeInput {
  name: string
  primary: string
  secondary: string
  background: string
  text: string
  /** 强调色（第 5 项） */
  accent: string
}

// 用户级设置（分类级设置后续迁入 CategorySettings）
export const settingsApi = {
  get: () => apiGet<SettingsPayload>('/api/settings'),
  setTheme: (theme: string) => apiPost<Record<string, never>>('/settings/theme', { theme }),
  setHiddenBuiltinThemes: (themes: string[]) =>
    apiPost<Record<string, never>>('/settings/hidden-builtin-themes', { themes }),
  updateProfile: (nickname: string, avatar: string) =>
    apiPost<Record<string, never>>('/settings/profile', { nickname, avatar }),
  /** 修改本人密码：校验当前密码，新密码 ≥6 位且两次一致。后端 /settings/password */
  changePassword: (old_password: string, new_password: string, confirm_password: string) =>
    apiPost<Record<string, never>>('/settings/password', {
      old_password,
      new_password,
      confirm_password,
    }),
  updateSystem: (payload: {
    links_per_row?: number
    dock_scale?: number
    session_days?: number
    open_in_new?: boolean
  }) => apiPost<Record<string, never>>('/settings/system', payload),
  /** 站点级品牌（公开读 / 登录写）：GET 拉取全站统一一套品牌 */
  getSite: () => apiGet<SiteSettingsDTO>('/api/site'),
  /** 站点级品牌写入：站点名称/主标题/副标题/logo/字体，全站生效 */
  updateSite: (payload: {
    site_name?: string
    site_title?: string
    site_subtitle?: string
    site_logo?: string
    font_sans?: string
    font_cjk?: string
  }) => apiPost<Record<string, never>>('/api/site', payload),
  setHome: (default_home: string) =>
    apiPost<Record<string, never>>('/settings/home', { default_home }),
  /** 总站默认进入页面：'nav'（导航页面）或 'workbench'（工作台） */
  setView: (default_view: string) =>
    apiPost<Record<string, never>>('/settings/view', { default_view }),
  setRegisterOpen: (open: boolean) =>
    apiPost<Record<string, never>>('/settings/register-open', { open: open ? 1 : 0 }),
  /** 导航分类默认进入的子视图：'nav'（分组视图）或 'overview'（总览视图） */
  setNavView: (default_nav_view: string) =>
    apiPost<Record<string, never>>('/settings/nav-view', { default_nav_view }),
  createCustomTheme: (payload: CustomThemeInput) =>
    apiPost<{ id: number }>('/settings/custom-theme', payload as unknown as Record<string, unknown>),
  deleteCustomTheme: (id: number) =>
    apiPost<Record<string, never>>(`/settings/custom-theme/${id}/delete`, {}),
  updateCustomTheme: (id: number, payload: Partial<CustomThemeInput>) =>
    apiPost<Record<string, never>>(`/settings/custom-theme/${id}`, payload as unknown as Record<string, unknown>),
}

// 管理员：用户管理（仅管理员可调用；后端 @admin_required 二次保护）
export const adminApi = {
  /** 列出所有用户（含管理员自身），供用户管理模块展示 */
  listUsers: () => apiGet<{ users: UserDTO[] }>('/api/admin/users'),
  /** 编辑某用户：可更新昵称、可重置密码（new_password 非空时生效） */
  updateUser: (userId: number, payload: { nickname?: string; new_password?: string; confirm_password?: string }) =>
    apiPost<{ user: UserDTO }>(`/api/admin/users/${userId}`, payload as unknown as Record<string, unknown>),
  /** 删除某用户（不能删自己），级联清理其数据 */
  deleteUser: (userId: number) =>
    apiDelete<Record<string, never>>(`/api/admin/users/${userId}`),
}

// 自定义配色
export const themesApi = {
  list: () => apiGet<ThemesPayload>('/api/custom-themes'),
}

// 数据导入 / 导出 / 备份 / 还原（GET 走普通导航下载，POST 走 multipart 上传）
export const dataApi = {
  exportUrl: (fmt: 'json' | 'xlsx' | 'html') => `/data/export/${fmt}`,
  backupUrl: () => '/data/backup',
  importData: (file: File) =>
    apiPostForm<{ stats: unknown }>('/data/import', toFormData({ file })),
  restoreData: (file: File) =>
    apiPostForm<{ stats: unknown }>('/data/restore', toFormData({ file })),
}

export type {
  UserDTO,
  GroupDTO,
  UngroupedDTO,
  LinkDTO,
  OverviewSectionDTO,
  CategoryItemDTO,
  UserSettingsDTO,
  CustomThemeDTO,
  SiteSettingsDTO,
  LinkFormInput,
  GroupFormInput,
}
