"""
models.py —— 数据库模型（SQLAlchemy ORM）
========================================
定义四张表：
  - User         : 用户表（登录账号、密码哈希、昵称、头像）
  - Link         : 导航链接表（每个链接属于某个用户，可归到某个分组）
  - Group        : 分组表（用户自定义分类，用于区分不同链接）
  - UserSettings : 用户设置表（主题配色、每行链接数、登录保持天数）

注意：这里只创建 db 实例，真正的初始化（db.init_app）在 app/__init__.py 中进行，
这样可以配合"应用工厂"模式，避免循环导入（circular import）问题。
"""

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone

# 先创建 db 实例（不绑定具体 app）
db = SQLAlchemy()


class User(UserMixin, db.Model):
    """用户表：存放登录账号、密码哈希，以及可选的昵称与头像。

    继承 UserMixin 后自动获得 is_authenticated / is_active /
    is_anonymous / get_id 等方法，这是 Flask-Login 识别"当前用户"所必需的。
    """
    __tablename__ = 'user'  # 数据库中真实的表名

    id = db.Column(db.Integer, primary_key=True)               # 主键，自增
    username = db.Column(db.String(80), unique=True, nullable=False)  # 用户名，唯一，不能为空
    password_hash = db.Column(db.String(256), nullable=False)  # 密码的哈希值（绝不存明文！）
    # 昵称：展示用，可空（为空时前端回退显示 username）
    nickname = db.Column(db.String(80), nullable=True)
    # 头像：图片 URL（http/https），可空（为空时前端显示默认 Lucide 用户图标）
    avatar = db.Column(db.String(255), nullable=True)
    # 管理员标志：仅一个用户可为管理员；管理员拥有系统设置/站点/数据/用户管理权限。
    # 发布后由「首个注册用户自动成为管理员」逻辑保证唯一性；存量库经 init_db 手工置位。
    is_admin = db.Column(db.Boolean, default=False, nullable=False)

    # 一对多关系：一个用户拥有多条链接
    # backref='owner' 让你能通过 link.owner 反向拿到所属用户对象
    # cascade='all, delete-orphan'：删除用户时，自动删除他名下的所有链接
    links = db.relationship('Link', backref='owner', lazy=True,
                            cascade='all, delete-orphan')
    # 一个用户拥有多个分组；删除用户时其分组一并删除
    groups = db.relationship('Group', backref='owner', lazy=True,
                             cascade='all, delete-orphan')
    # 一个用户拥有唯一一份设置（uselist=False → user.settings 是单个对象）
    settings = db.relationship('UserSettings', backref='owner', lazy=True,
                               cascade='all, delete-orphan', uselist=False)

    # ---- 密码相关辅助方法（不直接操作 password_hash 字段）----
    def set_password(self, password):
        """把明文密码转成哈希后保存。generate_password_hash 默认用 pbkdf2:sha256。"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """校验明文密码是否正确，返回 True / False。"""
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        """在命令行/日志里打印用户对象时显示的友好信息。"""
        return f'<User {self.username}>'


class Group(db.Model):
    """分组表：用户对链接做的自定义分类（如"工作""娱乐""常用"）。"""
    __tablename__ = 'group'

    id = db.Column(db.Integer, primary_key=True)
    # 外键：分组一定归属于某个用户
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)            # 分组名称
    icon = db.Column(db.String(50), nullable=True)             # Lucide 图标名，如 'folder' / 'briefcase'
    sort_order = db.Column(db.Integer, default=0)              # 侧栏排序，越小越靠前
    # 顶层分类（导航/工作台/资讯）：分组归属于某个分类，默认 'nav'；当前所有分组均为导航类
    category = db.Column(db.String(16), default='nav', nullable=False, index=True)
    # 该分组下链接卡片的展示样式：'card'（横向卡片，图标在左）/ 'link'（1:1 方块，图标在上）
    # 仅允许 'card' 或 'link'，路由层校验，避免任意字符串注入
    card_style = db.Column(db.String(8), nullable=True, default='card')
    # 横排卡片（图标在左）样式下，每行显示的链接数量（1~8）
    links_per_row = db.Column(db.Integer, default=4)
    # 矩形卡片（1:1 方块）样式下，每行显示的链接数量（1~24，方块更密）
    links_per_row_rect = db.Column(db.Integer, default=12)
    # 总览视图（单页展示所有分组）下，横排卡片样式的每行链接数量（1~8）。
    # 与导航视图的 links_per_row 分开设置；为 NULL 时回退到导航视图对应列数。
    links_per_row_overview = db.Column(db.Integer, default=None)
    # 总览视图（单页展示所有分组）下，矩形卡片样式的每行链接数量（1~24）。
    # 与导航视图的 links_per_row_rect 分开设置；为 NULL 时回退到导航视图对应列数。
    links_per_row_rect_overview = db.Column(db.Integer, default=None)
    # 卡片标题字号：sm / base / lg / xl / 2xl（白名单，路由层校验），默认 base
    title_font_size = db.Column(db.String(8), default='base')
    # 标题最大显示字符数（0 = 不限制，按字符截断，避免长标题撑破卡片）
    title_max_len = db.Column(db.Integer, default=0)
    # 是否显示卡片标题（False 时仅显示图标，标题与备注均不渲染）
    show_title = db.Column(db.Boolean, default=True)
    # 网格行间距 / 列间距（单位 px，0~48），分组级独立控制卡片疏密
    row_gap = db.Column(db.Integer, default=16)
    col_gap = db.Column(db.Integer, default=16)
    # Dock 风格鼠标滑过放大倍数（1.0~2.5，默认 1.4）；矩形卡片用此值，横排卡片 = 此值*0.857 收敛
    dock_scale = db.Column(db.Float, default=1.4)
    # 创建时间，默认当前 UTC 时间（使用时区感知写法，避免 Python 3.12+ 弃用警告）
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # 一个分组下有多条链接；注意：这里【不】加 delete-orphan，
    # 目的是删除分组时只把链接"移出分组"（group_id 置空），而不是连链接一起删掉
    links = db.relationship('Link', backref='group', lazy=True)

    def __repr__(self):
        return f'<Group {self.name}>'


class Link(db.Model):
    """导航链接表：用户收藏的每一个网址。"""
    __tablename__ = 'link'

    id = db.Column(db.Integer, primary_key=True)               # 主键
    # 外键：关联到 user 表的 id，确保链接一定归属于某个用户
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # 外键：可归到某个分组；nullable=True 表示"未分组"
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)
    title = db.Column(db.String(120), nullable=False)          # 链接标题（显示文字）
    url = db.Column(db.String(500), nullable=False)            # 链接地址
    icon = db.Column(db.String(80), nullable=True)             # Lucide 图标名，如 'globe' / 'mail' / 'link'（留空时用默认 link 图标）
    icon_url = db.Column(db.String(255), nullable=True)        # 用户上传的图标（/static/uploads/icons/...），优先于 icon 展示
    note = db.Column(db.String(200), nullable=True)            # 备注（选填）：卡片标题下方以浅灰小字展示
    # 卡片柔和背景色（如 #A6B5C0，莫兰迪/中国传统色），留空则使用默认主题表面色
    # 仅允许合法 #rrggbb，校验在路由层完成，避免把任意字符串注入到内联 style
    bg_color = db.Column(db.String(7), nullable=True)
    # 标题文字颜色（黑 #000000 / 白 #FFFFFF / 自定义 #rrggbb），留空则跟随主题文字色
    # 同样仅允许合法 #rrggbb，校验在路由层完成，避免 CSS 注入
    title_color = db.Column(db.String(7), nullable=True)
    sort_order = db.Column(db.Integer, default=0)              # 排序号，越小越靠前，默认 0
    # 创建时间，默认当前 UTC 时间（使用时区感知写法，避免 Python 3.12+ 弃用警告）
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Link {self.title}>'


class CustomTheme(db.Model):
    """用户自定义配色方案：可自选主色/辅色/背景/文字，保存到主题选项供切换。"""
    __tablename__ = 'custom_theme'

    id = db.Column(db.Integer, primary_key=True)
    # 外键：配色一定归属于某个用户
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(40), nullable=False)            # 配色名称
    # 颜色统一存为 #rrggbb 十六进制；应用时转换为 HSL 注入 CSS 变量
    primary = db.Column(db.String(7), nullable=False)          # 主色
    secondary = db.Column(db.String(7), nullable=False)        # 辅色
    background = db.Column(db.String(7), nullable=False)       # 背景（surface）
    text = db.Column(db.String(7), nullable=False)             # 文字（base content）
    accent = db.Column(db.String(7), nullable=False, default='#f59e0b')  # 强调色（开关/勾选/聚焦）
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='custom_themes')

    def __repr__(self):
        return f'<CustomTheme {self.name}>'


class UserSettings(db.Model):
    """用户设置表：每位用户一份（user_id 唯一）。"""
    __tablename__ = 'user_settings'

    id = db.Column(db.Integer, primary_key=True)
    # 外键 + 唯一约束：一个用户只能有一份设置
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    # 当前激活的 DaisyUI 主题名（如 light / dark / cupcake / synthwave ...）
    theme = db.Column(db.String(30), default='light')
    # 横排卡片（图标在左）样式下，每行显示的链接数量（1~8），控制网格列数
    links_per_row = db.Column(db.Integer, default=4)
    # 矩形卡片（1:1 方块）样式下，每行显示的链接数量（1~24）。
    # 矩形方块内容紧凑，适合更密集排布（如 app launcher），故单独给更大的上限。
    links_per_row_rect = db.Column(db.Integer, default=12)
    # 登录状态保持天数（remember-me cookie 有效期）
    session_days = db.Column(db.Integer, default=7)
    # 点击链接的打开方式：True=新窗口(_blank)，False=本窗口(_self)
    open_in_new = db.Column(db.Boolean, default=True)
    # 默认首页：'all'（全部链接）或 'group:<id>'（指定分组）；为空表示不强制
    default_home = db.Column(db.String(32), nullable=True)
    # 总站默认进入页面：'nav'（导航页面）或 'workbench'（工作台）；控制输入默认网址后落地的顶层视图
    default_view = db.Column(db.String(16), default='nav')
    # 全部链接 / 未分组页面的 Dock 放大倍数基准（1.0~2.5），与具体分组的 dock_scale 分开
    dock_scale = db.Column(db.Float, default=1.4)
    # 默认激活的顶层分类（刷新后回到该分类）；当前仅有 'nav'，后续工作台/资讯上线后默认仍回退 'nav'
    default_category = db.Column(db.String(16), default='nav')
    # 导航分类下默认进入的子视图：'nav'（导航视图）或 'overview'（总览视图）；仅对 nav 分类生效
    default_nav_view = db.Column(db.String(16), default='nav')
    # 用户已隐藏（从主题选择器移除）的内置主题名，逗号分隔；空字符串表示全部显示
    hidden_builtin_themes = db.Column(db.String(255), default='')

    def __repr__(self):
        return f'<UserSettings user_id={self.user_id} theme={self.theme}>'


class CategorySettings(db.Model):
    """分类级设置：每个 (用户, 分类) 一份 JSON 设置块（links_per_row / dock_scale / default_home 等）。

    阶段 0 仅建表，不迁移读写；后续做工作台 / 资讯时再把 nav 的现有「用户级」设置迁入此处，
    实现「全局设置」与「分类级设置」的分离。
    """
    __tablename__ = 'category_settings'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    category = db.Column(db.String(16), nullable=False)
    settings = db.Column(db.JSON, default=dict)
    __table_args__ = (db.UniqueConstraint('user_id', 'category', name='uq_user_category'),)

    def __repr__(self):
        return f'<CategorySettings user_id={self.user_id} category={self.category}>'


class SiteSettings(db.Model):
    """站点级全局设置（单例，固定 id=1）。

    整个站点共享一份配置，与具体用户无关。
    当前承载：
    - allow_register：是否开放注册
    - site_name / site_title / site_subtitle / site_logo：站点品牌（导航栏/文档标题/Logo）
    """
    __tablename__ = 'site_settings'

    id = db.Column(db.Integer, primary_key=True)               # 固定为 1（单例）
    allow_register = db.Column(db.Boolean, default=True)       # 是否开放注册（默认开放）
    # —— 站点品牌（用户在「设置 → 系统设置」中配置，全站统一一套；任何登录用户可写）——
    site_name = db.Column(db.String(64), default='Eiger')
    site_title = db.Column(db.String(128), default='')
    site_subtitle = db.Column(db.String(128), default='')
    site_logo = db.Column(db.String(512), default='')
    # —— 全局字体（管理员在「设置 → 字体设置」中配置，全站生效）——
    # font_sans：英文 / 数字字体栈（Latin / 数字优先）；font_cjk：中文字体栈。
    # 最终 body 字体 = font_sans + font_cjk + 系统兜底，浏览器按字形自动回退。
    font_sans = db.Column(
        db.String(256),
        default="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    )
    font_cjk = db.Column(
        db.String(256),
        default="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    )
    site_updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<SiteSettings id={self.id} allow_register={self.allow_register} site_name={self.site_name}>'


class BiddingItem(db.Model):
    """工作台「招标信息」已抓取条目（持久化到数据库，跨设备共享、自动清理半年以上）。

    - 每次抓取只新增：以 link 唯一键去重，已存在的链接跳过。
    - 读取直接走库：页面加载无需重新抓取，手动刷新才触发抓取并追加新条目。
    - 自动清理：published_at（缺省回退 fetched_at）超过 180 天的条目会被删除。
    """
    __tablename__ = 'bidding_item'

    id = db.Column(db.Integer, primary_key=True)
    source_url = db.Column(db.String(512), nullable=False, default='')   # 抓取源首页 URL
    source_name = db.Column(db.String(128), nullable=False, default='')  # 抓取源自定义名称（卡片展示用）
    title = db.Column(db.String(400), nullable=False, default='')
    # 去重键：复合唯一 (link, title)。
    # 普通源 link 即为唯一详情页 URL；反爬 SPA 源（如 ctbpsp）详情页无 <a href>，
    # 所有项 link 兜底为站点基址（相同），单列唯一会让同页多条公告互相冲突只能存 1 条，
    # 故改为 (link, title) 复合唯一，使同页不同公告可并存。
    link = db.Column(db.String(512), nullable=False)
    __table_args__ = (
        db.UniqueConstraint('link', 'title', name='uq_bidding_link_title'),
    )
    published_at = db.Column(db.DateTime, nullable=True)                 # 发布时间（解析不到则为空）
    body = db.Column(db.Text, default='')                                # 详情页正文
    body_available = db.Column(db.Boolean, nullable=True)                # 正文是否成功抓取
    # 列表页/搜索结果页自带的摘要/元数据片段（如 ctbpsp 的 span.btncas：
    # 「山西省 · 中标候选人公示 · 按10号令规范发布 · 接收时间:2026-08-26」）。
    # 反爬 SPA 源（ctbpsp）详情页无 <a href>、搜索接口也不返回正文/摘要，
    # 故列表页这一行元数据是「正文命中」项唯一可展示的内容（在卡片里充当摘要行），
    # 必须持久化，否则刷新后摘要丢失、卡片内容行空白。
    summary = db.Column(db.Text, default='')                            # 列表/搜索结果页摘要或元数据片段
    keywords = db.Column(db.Text, default='[]')                          # 命中的关键词（JSON 数组）
    fetched_at = db.Column(db.DateTime, nullable=False)                  # 入库时间（清理兜底依据）

    def __repr__(self):
        return f'<BiddingItem id={self.id} title={self.title!r}>'


class WorkbenchState(db.Model):
    """工作台布局 / 偏好 / 数据（按用户持久化，绑定账户，跨端口 / 跨设备共享）。

    解决痛点：原先工作台数据只存浏览器 localStorage，受「源隔离」限制，
    切换端口（如 5000↔5005）或换设备即视为新源、数据被「重置」。
    改为服务端以「每用户一行」存整份 JSON（order/sizes/prefs），登录态下
    作为唯一真相源；localStorage 仅作离线缓存。

    - user_id 唯一：一人一行，upsert 语义。
    - state：WbData 的 JSON 序列化（前端 workbench.ts 的 WbData 结构）。
    - updated_at：最近一次保存时间，便于排查 / 未来做冲突合并。
    """

    __tablename__ = 'workbench_state'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False, index=True
    )
    state = db.Column(db.Text, nullable=False, default='{}')  # JSON 序列化的 WbData
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<WorkbenchState user_id={self.user_id} updated_at={self.updated_at}>'
