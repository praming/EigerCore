// 前端 DTO 类型 —— 与 app/serializers.py 序列化字段严格对齐
// 日期统一为 ISO8601 字符串（或 null）

export interface UserDTO {
  id: number
  username: string
  nickname?: string | null
  avatar?: string | null
  /** 是否为管理员（仅管理员可见系统设置/站点/数据/用户管理模块） */
  is_admin?: boolean
}

export interface LinkDTO {
  id: number
  group_id: number | null
  title: string
  url: string
  icon: string | null
  icon_url: string | null
  note: string | null
  bg_color: string | null
  title_color: string | null
  sort_order: number
  created_at: string | null
}

export type CardStyle = 'card' | 'link'

/** 标题字号档位（后端 _parse_group_card_settings 白名单，存 Group.title_font_size String(8)） */
export type TitleFontSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '10px' | '12px'

export interface GroupDTO {
  id: number
  name: string
  icon: string | null
  sort_order: number
  category: string
  card_style: CardStyle
  links_per_row: number | null
  links_per_row_rect: number | null
  links_per_row_overview: number | null
  links_per_row_rect_overview: number | null
  title_font_size: TitleFontSize | null
  title_max_len: number | null
  show_title: boolean
  row_gap: number | null
  col_gap: number | null
  dock_scale: number | null
  created_at: string | null
  links?: LinkDTO[]
}

export interface UngroupedDTO {
  id: number // 固定为 0
  name: string
  count: number
  links: LinkDTO[]
}

export interface OverviewSectionDTO {
  id: number // 未分组段固定为 0
  name: string
  icon: string | null
  is_rect: boolean
  cols: number
  title_fs: TitleFontSize
  maxlen: number | null
  show_title: boolean
  dock_scale: number | null
  row_gap: number | null
  col_gap: number | null
  links: LinkDTO[]
}

export interface CategoryItemDTO {
  id: string
  name: string
  icon: string
  order: number
  enabled: boolean
}

export interface UserSettingsDTO {
  theme: string
  links_per_row: number | null
  links_per_row_rect: number | null
  session_days: number
  open_in_new: boolean
  default_home: string | null
  default_view: string
  default_nav_view: string
  dock_scale: number
  default_category: string
  hidden_builtin_themes: string[]
}

/**
 * 站点级全局设置（SiteSettings id=1，公开可读 / 登录可写）。
 * 与具体用户无关：所有登录用户共享同一套站点名称 / 主标题 / 副标题 / logo。
 */
export interface SiteSettingsDTO {
  /** 是否开放注册（任何登录用户可读、可写） */
  allow_register: boolean
  /** 站点名称（导航栏品牌文字，默认 'Eiger'） */
  site_name: string
  /** 站点主标题：浏览器标签 / 文档标题；为空则回退 site_name */
  site_title: string
  /** 副标题：品牌名下方小字标语；为空不显示 */
  site_subtitle: string
  /** 站点 logo 图片 URL；为空回退默认 mountain 图标 */
  site_logo: string
  /** 英文 / 数字字体栈（Latin / 数字优先）；为空回退内置默认 */
  font_sans: string
  /** 中文字体栈；为空回退内置默认 */
  font_cjk: string
}

export interface CustomThemeDTO {
  id: number
  name: string
  primary: string
  secondary: string
  background: string
  text: string
  /** 强调色（第 5 项）：驱动开关/勾选/聚焦环等强调态 */
  accent: string
}

// ----------------------------------------------------------------------
// 写接口输入（与 LinkForm / GroupForm + _parse_group_card_settings 字段名一致）
// ----------------------------------------------------------------------

/** 链接新增/编辑表单输入。字段名即后端表单域名，便于直接序列化为 FormData。 */
export interface LinkFormInput {
  title: string
  url: string
  note: string
  /**
   * Lucide 图标名。编辑时回传链接现有值，避免后端 `form.icon.data or 'link'`
   * 把已设的图标名重置为默认 link（Jinja 弹窗未提交该字段，存在此副作用）。
   */
  icon?: string
  /** 分组 id；0 表示「未分组」（后端会转成 NULL） */
  group_id: number
  /** 卡片背景色 #rrggbb，空串表示默认 */
  bg_color: string
  /** 标题文字颜色 #rrggbb，空串表示跟随主题 */
  title_color: string
  /** 上传的图标文件；null 表示不改动已有图标 */
  icon_file?: File | null
  /**
   * 清空已上传图标：选中内置图标 / 默认时置 true，使后端 icon_url 置空，
   * 避免旧图仍被优先展示。Jinja 不传此字段（默认 False），行为不变。
   */
  icon_url_clear?: boolean
}

/** 分组新增/编辑表单输入。 */
export interface GroupFormInput {
  name: string
  icon: string
  card_style: CardStyle
  /** 分组视图每行数（card 1~8 / link 1~24） */
  g_cols: number
  /** 总览视图每行数（同上区间，与分组视图独立） */
  g_cols_ov: number
  g_fs: TitleFontSize
  /** 标题最大字符数，0 为不限制（后端钳制 0~50） */
  g_maxlen: number
  g_show_title: boolean
  /** 行间距 px（后端钳制 0~48） */
  g_row_gap: number
  /** 列间距 px（后端钳制 0~48） */
  g_col_gap: number
  /** Dock 放大倍数（后端钳制 1.0~2.5） */
  g_dock_scale: number
}

// 统一错误形态（拦截器抛出）
export interface ApiError extends Error {
  code: string // 如 'API_ERROR' 或 'HTTP_401'
  payload?: unknown
  /** 表单校验失败时的逐字段错误（后端 _json_form_errors 下发） */
  errors?: Record<string, string[]>
}

// 各接口的 payload 形状（已剥离 status 字段）
export interface AuthMePayload extends UserDTO {}
export interface LoginPayload extends UserDTO {}
export interface CategoriesPayload {
  items: CategoryItemDTO[]
  current: string
}
export interface GroupsPayload {
  groups: GroupDTO[]
  ungrouped: UngroupedDTO
}
export interface LinksPayload {
  group_id: number
  links: LinkDTO[]
}
export interface OverviewPayload {
  sections: OverviewSectionDTO[]
  total: number
}
export interface SettingsPayload extends UserSettingsDTO {
  /** 站点级「开放注册」开关（只读，随用户设置一并下发，供设置页回显） */
  allow_register?: boolean
}
export interface ThemesPayload {
  themes: CustomThemeDTO[]
  active: string | null
}
/** 链接写接口回包：msg 供提示，link 为落库后的完整实体 */
export interface LinkMutationPayload {
  msg: string
  link: LinkDTO
}
/** 分组写接口回包（edit 会带上该分组当前链接，add 为空数组） */
export interface GroupMutationPayload {
  msg: string
  group: GroupDTO
}
/** 删除接口回包：id 为被删实体主键 */
export interface DeletePayload {
  msg: string
  id: number
}
/** 抓取网页标题回包 */
export interface FetchTitlePayload {
  title: string
}
