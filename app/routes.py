"""
routes.py —— 路由与视图函数（使用 Blueprint 蓝图）
=================================================
把所有页面/接口都注册到名为 'main' 的蓝图上，run.py 再把这个蓝图挂到 app 上。
好处：结构清晰、模块解耦，方便以后拆分成多个蓝图（如 api、admin）。

涉及"用户输入"的地方的安全说明（重要）：
  Flask 使用 Jinja2 模板引擎，默认开启自动转义（autoescape）。
  模板里用 {{ 变量 }} 输出用户数据时，< > & 等字符会被自动转义，
  从而天然防御 XSS 攻击。因此【绝不要】在用户可控内容上使用 | safe 过滤器
  （| safe 会关闭转义，反而引入 XSS 漏洞）。本项目的模板会遵循这一安全写法。
"""

from datetime import timedelta
import os
import io
import re
import time
import random
import urllib.request
import urllib.parse
import urllib.error

from flask import Blueprint, render_template, redirect, url_for, flash, request, abort, jsonify, current_app, send_file
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename
from flask_wtf.csrf import generate_csrf

from .models import db, User, Link, Group, UserSettings, CustomTheme, SiteSettings, WorkbenchState
from .forms import RegisterForm, LoginForm, LinkForm, GroupForm
from .utils import hex_to_hsl, on_color, sanitize_svg
from . import dataio, csrf
from .serializers import link_to_dict, group_to_dict, custom_theme_to_dict, settings_to_dict, site_to_dict, user_to_dict

# 创建蓝图，名字叫 'main'，后续 url_for('main.xxx') 都指向这里
bp = Blueprint('main', __name__)

# 可选的主题配色列表（DaisyUI 内置主题），用于设置页的"主题/配色"选择。
# 第一个元素是主题名（写入 data-theme / 数据库），第二个是中文展示名。
THEME_CHOICES = [
    ('light', '浅色'), ('dark', '暗夜'), ('cupcake', '糖果'), ('synthwave', '赛博朋克'),
    ('emerald', '翠绿'), ('corporate', '商务'), ('retro', '复古'), ('cyberpunk', '霓虹'),
    ('dracula', '德古拉'), ('nord', '北欧'), ('winter', '寒冬'), ('luxury', '奢华'),
    ('forest', '森林'), ('valentine', '浪漫'), ('autumn', '秋日'), ('business', '极简'),
    ('night', '夜晚'), ('coffee', '咖啡'), ('lemonade', '柠檬'), ('sunset', '日落'),
]
THEME_NAMES = {name for name, _ in THEME_CHOICES}


# ----------------------------------------------------------------------
# 工具函数：获取（或惰性创建）当前用户的设置对象
# ----------------------------------------------------------------------
def get_settings(user):
    """返回 user 对应的 UserSettings；若不存在则创建一份默认设置并落库。"""
    settings = UserSettings.query.filter_by(user_id=user.id).first()
    if settings is None:
        settings = UserSettings(user_id=user.id)  # 字段都有默认值
        db.session.add(settings)
        db.session.commit()
    return settings


def group_choices(user):
    """构造 LinkForm.group_id 的下拉选项：[(0, '未分组'), (id, name), ...]。"""
    # 仅取「导航」分类下的分组。阶段 0 仅一个分类；后续切换分类时此处应改为按 current_category 过滤
    groups = Group.query.filter_by(user_id=user.id, category='nav').order_by(Group.sort_order, Group.created_at).all()
    return [(0, '未分组')] + [(g.id, g.name) for g in groups]


def default_home_group_id(user):
    """返回默认首页应跳转到的分组 id（int）；无默认或默认是『全部』时返回 None。"""
    settings = get_settings(user)
    dh = settings.default_home
    if not dh or dh == 'all':
        return None
    if dh.startswith('group:'):
        try:
            return int(dh.split(':', 1)[1])
        except (ValueError, IndexError):
            return None
    return None


def get_site_settings():
    """返回站点级单例设置（id=1）；若不存在则惰性创建一份默认（开放注册 + 默认品牌）。"""
    ss = db.session.get(SiteSettings, 1)
    if ss is None:
        ss = SiteSettings(id=1, allow_register=True)
        db.session.add(ss)
        db.session.commit()
    return ss


def _wants_json():
    """判断本次写请求是否来自 SPA（期望 JSON 响应）而非 Jinja 表单（期望 302 重定向）。

    判定顺序（任一命中即为 JSON）：
      1. 显式声明 X-Requested-With: XMLHttpRequest —— SPA 的 axios 实例统一注入，最可靠；
      2. Accept 头更偏好 application/json 而非 text/html —— 兼容裸 fetch 调用。

    浏览器提交原生 <form> 时既无该头、Accept 又以 text/html 优先，
    因此 Jinja 端行为（flash + redirect）保持逐字节不变 —— 这是「零回归」的关键。
    """
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return True
    accept = request.accept_mimetypes
    return accept['application/json'] > 0 and accept['application/json'] >= accept['text/html']


def admin_required(f):
    """仅管理员可访问的视图装饰器，与 @login_required 叠加使用（放在其外层）。

    先由 @login_required 保证已登录，再由本装饰器校验 current_user.is_admin。
    - SPA（_wants_json）请求：返回 JSON 403 信封；
    - 传统浏览器请求：直接 abort(403)。
    """
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated or not getattr(current_user, 'is_admin', False):
            if _wants_json():
                return jsonify(status='error', msg='权限不足：需要管理员身份', code='forbidden'), 403
            abort(403)
        return f(*args, **kwargs)
    return decorated



def _json_form_errors(form):
    """把 WTForms 校验错误转成统一的 JSON 错误信封，供 SPA 逐字段回显。

    返回 (response, 400)：
      { status:'error', msg:'标题：标题不能为空', errors:{ title:['标题不能为空'] } }
    msg 取第一条「标签：错误」，与 Jinja 端 flash 的文案格式完全一致。
    """
    errors = {}
    first = None
    for field, msgs in form.errors.items():
        errors[field] = list(msgs)
        if first is None and msgs:
            label = getattr(getattr(form, field, None), 'label', None)
            label_text = label.text if label is not None else field
            first = f'{label_text}：{msgs[0]}'
    return jsonify(status='error', msg=first or '表单校验失败', errors=errors), 400


def _redirect_to_view():
    """新增 / 编辑 / 删除链接或分组后，停留在「当前正在查看」的视图与分组，而非跳回首页。

    SPA 模式下：Jinja 表单不再使用（SPA 走 JSON 接口），此处仅作为 Jinja 登录成功后的兜底，
    统一跳回 SPA 根路径。
    """
    if current_app.config.get('USE_SPA'):
        return redirect('/')

    vg = (request.form.get('view_group') or '').strip()
    view = (request.form.get('view') or '').strip()
    if view not in ('nav', 'overview'):
        view = None

    # 总览视图：分组级操作（增删改分组）不涉及具体 group 过滤，仅保留视图即可
    if view == 'overview':
        if vg in ('', 'all'):
            return redirect(url_for('main.dashboard', view='overview'))
        if vg == '0':
            return redirect(url_for('main.dashboard', view='overview', group=0))
        try:
            n = int(vg)
            if n > 0:
                return redirect(url_for('main.dashboard', view='overview', group=n))
        except (TypeError, ValueError):
            pass
        return redirect(url_for('main.dashboard', view='overview'))

    # 导航视图：按分组过滤停留在原分组
    if vg in ('', 'all'):
        return redirect(url_for('main.dashboard'))
    if vg == '0':
        return redirect(url_for('main.dashboard', group=0))
    try:
        n = int(vg)
        if n > 0:
            return redirect(url_for('main.dashboard', group=n))
    except (TypeError, ValueError):
        pass
    return redirect(url_for('main.dashboard'))


def sanitize_bg_color(value):
    """只允许合法 #rrggbb（不区分大小写），其余一律视为空（使用默认背景）。

    这是安全防线：bg_color 会直接写进卡片内联 style 的 --card-bg，
    若放行任意字符串可能造成 CSS 注入，因此严格限制为十六进制颜色。
    """
    if not value:
        return None
    v = value.strip()
    if not re.match(r'^#?[0-9a-fA-F]{6}$', v):
        return None
    return v if v.startswith('#') else '#' + v


def _sanitize_card_style(value):
    """分组卡片展示样式只允许 'card' 或 'link'，其余一律回退到 'card'。"""
    return value if value in ('card', 'link') else 'card'


def _build_overview_sections(user):
    """为「总览」视图构建分段数据：每个分组（及未分组）一段，各自携带其分组级卡片设置。

    返回 list[dict]，每项含 id/name/icon/is_rect/cols/title_fs/maxlen/show_title/
    dock_scale/row_gap/col_gap/links，供模板逐段渲染并独立应用 Dock 倍数与排版。
    """
    groups = Group.query.filter_by(user_id=user.id, category='nav').order_by(Group.sort_order, Group.created_at).all()
    sections = []
    for g in groups:
        style = _sanitize_card_style(g.card_style)
        is_rect = style == 'link'
        # 总览视图优先使用「总览专用」每行列数；未设置则回退到导航视图对应列数，再兜底默认值
        ov_cols = (g.links_per_row_rect_overview if is_rect else g.links_per_row_overview)
        nav_cols = (g.links_per_row_rect if is_rect else g.links_per_row)
        cols = ov_cols or nav_cols or (12 if is_rect else 4)
        title_fs = g.title_font_size or 'base'
        maxlen = g.title_max_len or 0
        show_title = bool(g.show_title)
        dock_scale = float(g.dock_scale or 1.4)
        row_gap = g.row_gap or 16
        col_gap = g.col_gap or 16
        glinks = (Link.query.filter_by(user_id=user.id, group_id=g.id)
                  .order_by(Link.sort_order, Link.created_at).all())
        sections.append({
            'id': g.id, 'name': g.name, 'icon': g.icon or 'folder',
            'is_rect': is_rect, 'cols': cols, 'title_fs': title_fs,
            'maxlen': maxlen, 'show_title': show_title, 'dock_scale': dock_scale,
            'row_gap': row_gap, 'col_gap': col_gap, 'links': glinks,
        })
    # 未分组（group_id 为 NULL）作为最后一段
    ungrouped_count = Link.query.filter_by(user_id=user.id, group_id=None).count()
    if ungrouped_count > 0:
        ulinks = (Link.query.filter_by(user_id=user.id, group_id=None)
                  .order_by(Link.sort_order, Link.created_at).all())
        sections.append({
            'id': 0, 'name': '未分组', 'icon': 'inbox',
            'is_rect': False, 'cols': 4, 'title_fs': 'base',
            'maxlen': 0, 'show_title': True, 'dock_scale': 1.4,
            'row_gap': 16, 'col_gap': 16, 'links': ulinks,
        })
    return sections


def _parse_group_card_settings(form):
    """从分组表单解析「分组级卡片设置」，返回 (card_style, links_per_row,
    links_per_row_rect, links_per_row_overview, links_per_row_rect_overview,
    title_font_size, title_max_len, show_title, row_gap, col_gap, dock_scale)。

    - 列数按当前卡片样式写入对应字段（card→links_per_row 1~8 / link→links_per_row_rect
      1~24），另一字段返回 None，由调用方决定保留原值还是用 DB 默认值；
    - 总览视图列数同理写入 links_per_row_overview / links_per_row_rect_overview，
      与导航视图独立；未设置（为空）时返回 None，调用方保留原值；
    - 标题字号限白名单 sm/base/lg/xl/2xl/10px/12px，其余回退 base；
    - 最大字符数限制在 0~50（0 不限制）；
    - 是否显示标题：复选框勾选才提交（值为 '1'），未勾选则视为 False；
    - 行/列间距：px 整数，钳制 0~48，缺省 16。
    """
    card_style = _sanitize_card_style(form.get('card_style'))
    try:
        cols_val = int(form.get('g_cols')) if form.get('g_cols') else None
    except (TypeError, ValueError):
        cols_val = None
    # 总览视图每行数（独立字段，可为空 → None）
    try:
        ov_cols_val = int(form.get('g_cols_ov')) if form.get('g_cols_ov') else None
    except (TypeError, ValueError):
        ov_cols_val = None
    title_fs = form.get('g_fs') or 'base'
    if title_fs not in ('sm', 'base', 'lg', 'xl', '2xl', '10px', '12px'):
        title_fs = 'base'
    try:
        max_len = int(form.get('g_maxlen') or 0)
    except (TypeError, ValueError):
        max_len = 0
    max_len = max(0, min(max_len, 50))
    show_title = form.get('g_show_title') == '1'
    try:
        row_gap = int(form.get('g_row_gap') or 16)
    except (TypeError, ValueError):
        row_gap = 16
    row_gap = max(0, min(row_gap, 48))
    try:
        col_gap = int(form.get('g_col_gap') or 16)
    except (TypeError, ValueError):
        col_gap = 16
    col_gap = max(0, min(col_gap, 48))
    try:
        dock_scale = float(form.get('g_dock_scale') or 1.4)
    except (TypeError, ValueError):
        dock_scale = 1.4
    dock_scale = max(1.0, min(dock_scale, 2.5))
    if card_style == 'link':
        lpr = None
        lprr = max(1, min(cols_val or 12, 24))
        lpr_ov = None
        lprr_ov = max(1, min(ov_cols_val or 12, 24))
    else:
        lpr = max(1, min(cols_val or 4, 8))
        lprr = None
        lpr_ov = max(1, min(ov_cols_val or 4, 8))
        lprr_ov = None
    return card_style, lpr, lprr, lpr_ov, lprr_ov, title_fs, max_len, show_title, row_gap, col_gap, dock_scale


# ----------------------------------------------------------------------
# 上传图标相关
# ----------------------------------------------------------------------
ALLOWED_ICON_EXT = {'png', 'jpg', 'jpeg', 'svg'}
ICON_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'icons')


def save_icon_file(file):
    """保存上传的图标文件到 static/uploads/icons/，返回可访问的 URL；失败返回 None。

    - 仅允许 png/jpg/jpeg/svg；
    - svg 会经过 sanitize_svg 净化（去除脚本与事件处理器）防 XSS；
    - 文件名随机化，避免覆盖与路径穿越。
    """
    if not file or not getattr(file, 'filename', ''):
        return None
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext not in ALLOWED_ICON_EXT:
        return None

    os.makedirs(ICON_UPLOAD_DIR, exist_ok=True)
    # 生成唯一文件名（时间戳 + 随机），避免碰撞与覆盖
    uniq = f"{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    saved = f"icon_{uniq}.{ext}"
    path = os.path.join(ICON_UPLOAD_DIR, saved)

    if ext == 'svg':
        try:
            raw = file.stream.read().decode('utf-8', 'ignore')
        except Exception:
            return None
        safe = sanitize_svg(raw)
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(safe)
        except Exception:
            return None
    else:
        try:
            file.save(path)
        except Exception:
            return None

    return f"/static/uploads/icons/{saved}"


def ct_to_vars(ct):
    """把 CustomTheme 对象转为前端需要的 HSL 变量字典（含原始 hex 用于色块预览）。"""
    accent = ct.accent or '#f59e0b'
    return {
        'id': ct.id,
        'name': ct.name,
        'primary': ct.primary,
        'secondary': ct.secondary,
        'background': ct.background,
        'text': ct.text,
        'accent': accent,
        'p': hex_to_hsl(ct.primary),
        's': hex_to_hsl(ct.secondary),
        'b1': hex_to_hsl(ct.background),
        'b2': hex_to_hsl(ct.background),
        'bc': hex_to_hsl(ct.text),
        'pc': on_color(ct.primary),
        'a': hex_to_hsl(accent),
        'af': hex_to_hsl(accent),
    }


# ----------------------------------------------------------------------
# 首页：已登录跳仪表盘，未登录跳登录页
# ----------------------------------------------------------------------
@bp.route('/')
def index():
    # SPA 模式：无论登录与否都返回 SPA 入口；SPA 内部根据 /api/auth/me 自行决定跳转 /login
    if current_app.config.get('USE_SPA'):
        return _serve_spa_index()
    if current_user.is_authenticated:
        return _redirect_to_view()
    return redirect(url_for('main.login'))


def _serve_spa_index():
    """返回构建好的 SPA 入口（web/dist/index.html）；仅在 USE_SPA 模式下被调用。"""
    return send_file(current_app.config['SPA_DIST_INDEX'])


# ----------------------------------------------------------------------
# 注册
# ----------------------------------------------------------------------
@bp.route('/register', methods=['GET', 'POST'])
def register():
    # 注册已关闭：直接拦截，避免有人绕过前端链接直访 /register
    if not get_site_settings().allow_register:
        flash('注册功能已关闭。', 'error')
        return redirect(url_for('main.login'))

    form = RegisterForm()
    if form.validate_on_submit():
        # 先查用户名是否已被占用
        if User.query.filter_by(username=form.username.data).first():
            flash('该用户名已被注册，请换一个。', 'error')
            return redirect(url_for('main.register'))

        # 创建用户并保存密码哈希（绝不明文存储）
        user = User(username=form.username.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()

        # 首个注册用户自动成为管理员（发布后规则：全局仅一个管理员）。
        # 仅当目前还没有任何管理员时，才把当前新用户置为管理员；
        # 若已存在管理员（如开发库里的 praming），后续注册用户保持普通身份。
        if not User.query.filter_by(is_admin=True).first():
            user.is_admin = True
            db.session.commit()

        # 同时为该用户创建一份默认设置（主题/列数/保持天数）
        db.session.add(UserSettings(user_id=user.id))
        db.session.commit()

        flash('注册成功，请登录。', 'success')
        return redirect(url_for('main.login'))

    return render_template('register.html', form=form)


# ----------------------------------------------------------------------
# 登录
# ----------------------------------------------------------------------
@bp.route('/login', methods=['GET', 'POST'])
def login():
    # 已登录用户直接进仪表盘
    if current_user.is_authenticated:
        return _redirect_to_view()

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        # 用户存在且密码正确才放行
        if user and user.check_password(form.password.data):
            # 读取该用户的"登录保持天数"，作为 remember-me cookie 有效期
            days = get_settings(user).session_days
            # remember=True 让会话以持久 cookie 保存；duration 控制有效天数
            login_user(user, remember=True, duration=timedelta(days=days))
            flash('登录成功，欢迎回来！', 'success')
            return _redirect_to_view()
        # 不具体说明是"用户不存在"还是"密码错"，避免被撞库
        flash('用户名或密码错误。', 'error')

    return render_template('login.html', form=form)


# ----------------------------------------------------------------------
# 退出登录
# ----------------------------------------------------------------------
@bp.route('/logout')
@login_required  # 必须登录才能访问，否则自动跳转到 login_view
def logout():
    logout_user()
    flash('您已退出登录。', 'success')
    return redirect(url_for('main.login'))


# ----------------------------------------------------------------------
# 仪表盘：展示当前用户的导航链接（支持按分组过滤）
# ----------------------------------------------------------------------
@bp.route('/dashboard')
@login_required
def dashboard():
    # SPA 模式下仪表盘由前端渲染，避免渲染已废弃的 Jinja 模板
    if current_app.config.get('USE_SPA'):
        return redirect('/')
    # 视图模式：nav（默认，单组导航）/ overview（总览，单页展示所有分组并滚动定位）
    view = request.args.get('view', 'nav')

    # 分组过滤：从 URL 查询参数 ?group=<id> 读取
    #   - 不传 / group 为空        → 显示全部链接
    #   - group=0                  → 仅"未分组"（group_id IS NULL）
    #   - group=<正整数>           → 仅该分组下的链接
    #   - group=__all__            → 显式"全部"，且不触发默认首页跳转
    group_raw = request.args.get('group')
    # 默认首页：仅在「裸访问」（未指定任何分组）时生效，避免覆盖用户的手动切换
    target = default_home_group_id(current_user)
    if group_raw is None and target is not None:
        return redirect(url_for('main.dashboard', group=target))
    group_arg = request.args.get('group', type=int)  # 非法/缺失返回 None
    query = Link.query.filter_by(user_id=current_user.id)
    if group_arg is not None:
        if group_arg == 0:
            query = query.filter(Link.group_id.is_(None))
        else:
            query = query.filter_by(group_id=group_arg)
    links = query.order_by(Link.sort_order, Link.created_at).all()

    # 侧栏分组列表 + 当前用户设置 + 表单
    groups = Group.query.filter_by(user_id=current_user.id, category='nav').order_by(Group.sort_order, Group.created_at).all()
    settings = get_settings(current_user)
    form = LinkForm()
    form.group_id.choices = group_choices(current_user)   # 动态填充分组下拉
    group_form = GroupForm()

    # "未分组"分组入口是否展示：仅当确实无分组的链接存在时显示（或当前正查看该分组）
    ungrouped_count = Link.query.filter_by(user_id=current_user.id, group_id=None).count()
    show_ungrouped = (ungrouped_count > 0) or (group_arg == 0)

    # 当前筛选分区的标题（用于右侧面板头部，替代原先的"欢迎回来"问候语）
    if group_arg is None:
        active_group_title = '全部链接'
    elif group_arg == 0:
        active_group_title = '未分组'
    else:
        g = Group.query.filter_by(id=group_arg, user_id=current_user.id).first()
        active_group_title = g.name if g else '分组'

    # 当前分组下链接卡片的展示样式（card / link）；仅当正在查看某个具体分组时生效，
    # "全部"或"未分组"始终用卡片样式。作为网格修饰类传入模板（link-card--link）。
    if group_arg and group_arg != 0:
        _g = Group.query.filter_by(id=group_arg, user_id=current_user.id).first()
        active_card_style = _sanitize_card_style(_g.card_style if _g else 'card')
    else:
        active_card_style = 'card'

    # 网格每行列数 + 标题字号 / 最大字符数：具体到某分组时用该分组的「分组级卡片设置」，
    # 否则（全部 / 未分组视图）回退到用户全局默认（UserSettings），保证各分组可独立配置密度与排版
    _active_group_obj = None
    if group_arg and group_arg != 0:
        _active_group_obj = Group.query.filter_by(id=group_arg, user_id=current_user.id).first()
    if _active_group_obj is not None:
        card_cols = (_active_group_obj.links_per_row_rect if active_card_style == 'link'
                     else _active_group_obj.links_per_row) or (12 if active_card_style == 'link' else 4)
        card_title_font_size = _active_group_obj.title_font_size or 'base'
        card_title_max_len = _active_group_obj.title_max_len or 0
        card_show_title = bool(_active_group_obj.show_title)
        card_row_gap = _active_group_obj.row_gap or 16
        card_col_gap = _active_group_obj.col_gap or 16
        card_dock_scale = float(_active_group_obj.dock_scale or 1.4)
    else:
        card_cols = (settings.links_per_row_rect if active_card_style == 'link'
                     else settings.links_per_row) or (12 if active_card_style == 'link' else 4)
        card_title_font_size = 'base'
        card_title_max_len = 0
        card_show_title = True
        card_row_gap = 16
        card_col_gap = 16
        card_dock_scale = float(settings.dock_scale or 1.4)

    # 自定义配色（数据库里属于当前用户）
    custom_query = CustomTheme.query.filter_by(user_id=current_user.id).order_by(CustomTheme.created_at).all()
    custom_themes = [ct_to_vars(ct) for ct in custom_query]
    active_custom = None
    if settings.theme and settings.theme.startswith('custom:'):
        cid = settings.theme.split(':', 2)[1]
        ct = CustomTheme.query.filter_by(id=cid, user_id=current_user.id).first()
        if ct:
            active_custom = ct_to_vars(ct)

    # 「总览」视图：构建所有分组（含未分组）的分段数据，单页展示
    overview_sections = []
    total_links = 0
    if view == 'overview':
        overview_sections = _build_overview_sections(current_user)
        total_links = sum(len(s['links']) for s in overview_sections)

    return render_template('dashboard.html',
                           links=links, groups=groups, settings=settings,
                           form=form, group_form=group_form,
                           view=view,
                           active_group=group_arg, active_group_title=active_group_title,
                           active_card_style=active_card_style,
                           card_cols=card_cols, card_title_font_size=card_title_font_size,
                           card_title_max_len=card_title_max_len,
                           card_show_title=card_show_title,
                           card_row_gap=card_row_gap, card_col_gap=card_col_gap,
                           card_dock_scale=card_dock_scale,
                           show_ungrouped=show_ungrouped,
                           overview_sections=overview_sections, total_links=total_links,
                           themes=THEME_CHOICES, custom_themes=custom_themes,
                           active_custom=active_custom)


# ----------------------------------------------------------------------
# 新增链接（仅 POST）
# ----------------------------------------------------------------------
@bp.route('/link/add', methods=['POST'])
@login_required
def add_link():
    form = LinkForm()
    form.group_id.choices = group_choices(current_user)   # 必须与渲染时一致，否则校验失败
    if form.validate_on_submit():
        # 新链接的排序值 = 当前用户已有链接的最大 sort_order + 1，保证排在最后
        max_order = (db.session.query(db.func.max(Link.sort_order))
                     .filter_by(user_id=current_user.id).scalar()) or 0

        # group_id=0 表示"未分组"，统一存为 None 更直观
        group_id = form.group_id.data or None

        # 处理图标上传（jpg/png/svg）；未上传则用默认 Lucide 图标
        icon_url = save_icon_file(request.files.get('icon_file'))

        # 卡片柔和背景色：仅接受合法 #rrggbb，杜绝 CSS 注入
        bg_color = sanitize_bg_color(request.form.get('bg_color'))
        # 标题文字颜色：同样仅接受合法 #rrggbb，杜绝 CSS 注入
        title_color = sanitize_bg_color(request.form.get('title_color'))

        link = Link(
            user_id=current_user.id,                       # 归属于当前登录用户
            group_id=group_id,                             # 所属分组（可为空）
            title=form.title.data,
            url=form.url.data,
            icon=form.icon.data or 'link',     # 没填图标就用默认 Lucide 图标（link）
            icon_url=icon_url,                 # 上传图标优先展示
            note=form.note.data or None,       # 备注可空
            bg_color=bg_color,                 # 卡片背景色（可为空 → 默认）
            title_color=title_color,           # 标题颜色（可为空 → 跟随主题文字色）
            sort_order=max_order + 1,
        )
        db.session.add(link)
        db.session.commit()
        if _wants_json():
            return jsonify(status='ok', msg='链接已添加。', link=link_to_dict(link))
        flash('链接已添加。', 'success')
    else:
        if _wants_json():
            return _json_form_errors(form)
        # 校验失败：把每个字段的错误信息用 flash 提示出来
        for field, errors in form.errors.items():
            for err in errors:
                label = getattr(form, field).label.text
                flash(f'{label}：{err}', 'error')

    return _redirect_to_view()


# ----------------------------------------------------------------------
# 编辑链接（仅 POST，且只能改自己的）
# 字段校验复用 LinkForm；校验失败同样用 flash 提示
# ----------------------------------------------------------------------
@bp.route('/link/<int:link_id>/edit', methods=['POST'])
@login_required
def edit_link(link_id):
    link = db.session.get(Link, link_id)   # SQLAlchemy 2.0 推荐写法
    if link is None:
        abort(404)
    if link.user_id != current_user.id:    # 越权防护
        abort(403)

    form = LinkForm()
    form.group_id.choices = group_choices(current_user)
    if form.validate_on_submit():
        # 仅更新用户提交且校验通过的字段
        link.title = form.title.data
        link.url = form.url.data
        link.icon = form.icon.data or 'link'
        # 图标上传：仅当本次提交了新文件时才替换（避免编辑时清空已有图标）
        new_icon = save_icon_file(request.files.get('icon_file'))
        if new_icon:
            link.icon_url = new_icon
        # SPA 切换为「内置图标 / 默认」时请求清除已上传图标，避免旧图仍被优先展示
        elif form.icon_url_clear.data:
            link.icon_url = None
        link.note = form.note.data or None
        link.group_id = form.group_id.data or None
        # 卡片背景色：仅接受合法 #rrggbb，杜绝 CSS 注入
        link.bg_color = sanitize_bg_color(request.form.get('bg_color'))
        # 标题颜色：同样仅接受合法 #rrggbb，杜绝 CSS 注入
        link.title_color = sanitize_bg_color(request.form.get('title_color'))
        db.session.commit()
        if _wants_json():
            return jsonify(status='ok', msg='链接已更新。', link=link_to_dict(link))
        flash('链接已更新。', 'success')
    else:
        if _wants_json():
            return _json_form_errors(form)
        for field, errors in form.errors.items():
            for err in errors:
                label = getattr(form, field).label.text
                flash(f'{label}：{err}', 'error')

    return _redirect_to_view()


# ----------------------------------------------------------------------
# 删除链接（仅 POST，且只能删自己的）
# ----------------------------------------------------------------------
@bp.route('/link/<int:link_id>/delete', methods=['POST'])
@login_required
def delete_link(link_id):
    link = db.session.get(Link, link_id)   # SQLAlchemy 2.0 推荐写法
    if link is None:                        # 查不到直接返回 404
        abort(404)
    if link.user_id != current_user.id:    # 越权防护：不能删别人的链接
        abort(403)
    db.session.delete(link)
    db.session.commit()
    if _wants_json():
        return jsonify(status='ok', msg='链接已删除。', id=link_id)
    flash('链接已删除。', 'success')
    return _redirect_to_view()


# ----------------------------------------------------------------------
# 拖拽排序接口（供前端 SortableJS 调用，接收 JSON）
# 端点：POST /update-order
# 前端提交格式：{"order": [id1, id2, id3, ...]}  （link 的 id 按新顺序排列）
# 后端逻辑：按列表下标逐个更新 sort_order（下标+1），保证顺序与前端一致
# ----------------------------------------------------------------------
@bp.route('/update-order', methods=['POST'])
@login_required
def update_order():
    data = request.get_json(silent=True) or {}   # 解析 JSON，失败返回 None 再兜底 {}
    order = data.get('order', [])
    if not isinstance(order, list):              # 防御：order 必须是列表
        return jsonify(status='error', msg='order 格式错误'), 400

    # 单条循环更新：遍历前端传来的 id 顺序，把 sort_order 设为下标+1
    # 只更新"属于自己"的链接，忽略非法 / 他人 id（越权防护）
    for index, link_id in enumerate(order):
        link = db.session.get(Link, link_id)
        if link and link.user_id == current_user.id:
            link.sort_order = index + 1

    db.session.commit()
    # 返回 JSON 给前端（ajax 请求，不需要跳转页面）
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 分组拖拽排序接口（编辑模式下侧栏分组重排，接收 JSON）
# 端点：POST /group/update-order
# 前端提交格式：{"order": [id1, id2, id3, ...]}（group 的 id 按新顺序）
# 后端：按列表下标逐个更新 sort_order（下标+1），仅更新属于自己的分组
# ----------------------------------------------------------------------
@bp.route('/group/update-order', methods=['POST'])
@login_required
def group_update_order():
    data = request.get_json(silent=True) or {}
    order = data.get('order', [])
    if not isinstance(order, list):
        return jsonify(status='error', msg='order 格式错误'), 400

    for index, gid in enumerate(order):
        g = db.session.get(Group, gid)
        if g and g.user_id == current_user.id:
            g.sort_order = index + 1

    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 分组：新增（仅 POST）
# ----------------------------------------------------------------------
@bp.route('/group/add', methods=['POST'])
@login_required
def add_group():
    form = GroupForm()
    if form.validate_on_submit():
        # 排序值 = 当前用户已有分组的最大 sort_order + 1
        max_order = (db.session.query(db.func.max(Group.sort_order))
                     .filter_by(user_id=current_user.id, category='nav').scalar()) or 0
        card_style, lpr, lprr, lpr_ov, lprr_ov, title_fs, max_len, show_title, row_gap, col_gap, dock_scale = _parse_group_card_settings(request.form)
        group = Group(
            user_id=current_user.id,
            category='nav',
            name=form.name.data,
            icon=form.icon.data or 'folder',   # 没填图标用默认 folder
            sort_order=max_order + 1,
            card_style=card_style,
            title_font_size=title_fs,
            title_max_len=max_len,
            show_title=show_title,
            row_gap=row_gap,
            col_gap=col_gap,
            dock_scale=dock_scale,
        )
        # 按当前卡片样式写入对应列数字段；另一字段保持默认（切换样式无需重设密度）
        if lpr is not None:
            group.links_per_row = lpr
        if lprr is not None:
            group.links_per_row_rect = lprr
        # 总览视图专用列数（与导航视图独立），未设置（None）时保留原值
        if lpr_ov is not None:
            group.links_per_row_overview = lpr_ov
        if lprr_ov is not None:
            group.links_per_row_rect_overview = lprr_ov
        db.session.add(group)
        db.session.commit()
        if _wants_json():
            return jsonify(status='ok', msg='分组已创建。', group=group_to_dict(group, links=[]))
        flash('分组已创建。', 'success')
    else:
        if _wants_json():
            return _json_form_errors(form)
        for field, errors in form.errors.items():
            for err in errors:
                label = getattr(form, field).label.text
                flash(f'{label}：{err}', 'error')

    return _redirect_to_view()


# ----------------------------------------------------------------------
# 分组：编辑（仅 POST，且只能改自己的）
# ----------------------------------------------------------------------
@bp.route('/group/<int:group_id>/edit', methods=['POST'])
@login_required
def edit_group(group_id):
    group = db.session.get(Group, group_id)
    if group is None:
        abort(404)
    if group.user_id != current_user.id:     # 越权防护
        abort(403)

    form = GroupForm()
    if form.validate_on_submit():
        card_style, lpr, lprr, lpr_ov, lprr_ov, title_fs, max_len, show_title, row_gap, col_gap, dock_scale = _parse_group_card_settings(request.form)
        group.name = form.name.data
        group.icon = form.icon.data or 'folder'
        group.card_style = card_style
        group.title_font_size = title_fs
        group.title_max_len = max_len
        group.show_title = show_title
        group.row_gap = row_gap
        group.col_gap = col_gap
        group.dock_scale = dock_scale
        # 按当前卡片样式写入对应列数字段；另一字段保留原值（不覆盖）
        if lpr is not None:
            group.links_per_row = lpr
        if lprr is not None:
            group.links_per_row_rect = lprr
        # 总览视图专用列数（与导航视图独立），未设置（None）时保留原值
        if lpr_ov is not None:
            group.links_per_row_overview = lpr_ov
        if lprr_ov is not None:
            group.links_per_row_rect_overview = lprr_ov
        db.session.commit()
        if _wants_json():
            # 带上该分组当前链接，SPA 可就地替换整段而无需再拉一次 /api/groups
            glinks = (Link.query.filter_by(user_id=current_user.id, group_id=group.id)
                      .order_by(Link.sort_order, Link.created_at).all())
            return jsonify(status='ok', msg='分组已更新。', group=group_to_dict(group, links=glinks))
        flash('分组已更新。', 'success')
    else:
        if _wants_json():
            return _json_form_errors(form)
        for field, errors in form.errors.items():
            for err in errors:
                label = getattr(form, field).label.text
                flash(f'{label}：{err}', 'error')

    return _redirect_to_view()


# ----------------------------------------------------------------------
# 分组：删除（仅 POST，且只能删自己的）
# 删除分组时，把其下链接的 group_id 置空（移到"未分组"），而非连链接一起删
# ----------------------------------------------------------------------
@bp.route('/group/<int:group_id>/delete', methods=['POST'])
@login_required
def delete_group(group_id):
    group = db.session.get(Group, group_id)
    if group is None:
        abort(404)
    if group.user_id != current_user.id:     # 越权防护
        abort(403)

    # 该分组下的链接移回"未分组"
    Link.query.filter_by(group_id=group.id).update({Link.group_id: None})
    db.session.delete(group)
    db.session.commit()
    if _wants_json():
        return jsonify(status='ok', msg='分组已删除，其链接已移至未分组。', id=group_id)
    flash('分组已删除，其链接已移至未分组。', 'success')
    return _redirect_to_view()


# ----------------------------------------------------------------------
# 设置：主题 / 配色（接收 JSON，更新当前用户的 theme 字段）
# ----------------------------------------------------------------------
@bp.route('/settings/theme', methods=['POST'])
@login_required
def settings_theme():
    data = request.get_json(silent=True) or {}
    theme = (data.get('theme') or '').strip()
    # 允许白名单内的内置主题，或自定义配色（custom:<id> 格式）
    valid = theme in THEME_NAMES or re.match(r'^custom:\d+$', theme) is not None
    if not valid:                           # 防止注入任意 data-theme
        return jsonify(status='error', msg='非法主题'), 400
    settings = get_settings(current_user)
    settings.theme = theme
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：隐藏 / 恢复内置主题（用户级，存逗号分隔清单；自定义主题走单独的增删接口）
# ----------------------------------------------------------------------
@bp.route('/settings/hidden-builtin-themes', methods=['POST'])
@login_required
def settings_hidden_builtin_themes():
    data = request.get_json(silent=True) or {}
    themes = data.get('themes')
    # 必须是内置主题名的列表，且全部在白名单内，避免注入任意 data-theme
    if not isinstance(themes, list) or not all(isinstance(t, str) for t in themes):
        return jsonify(status='error', msg='参数格式错误'), 400
    invalid = [t for t in themes if t not in THEME_NAMES]
    if invalid:
        return jsonify(status='error', msg='包含未知主题'), 400
    settings = get_settings(current_user)
    settings.hidden_builtin_themes = ','.join(themes)
    # 若当前激活主题正被隐藏，则回退浅色，避免选择器里看不见却仍生效
    if settings.theme in THEME_NAMES and settings.theme in themes:
        settings.theme = 'light'
    db.session.commit()
    return jsonify(status='ok')
# 设置：用户资料（昵称 / 头像）
# ----------------------------------------------------------------------
@bp.route('/settings/profile', methods=['POST'])
@login_required
def settings_profile():
    data = request.get_json(silent=True) or {}
    nickname = (data.get('nickname') or '').strip()
    avatar = (data.get('avatar') or '').strip()

    if len(nickname) > 80:
        return jsonify(status='error', msg='昵称过长（≤80）'), 400
    # 头像只允许为空或以 http(s) 开头的图片 URL（避免伪协议 / 脚本注入）
    if avatar and not avatar.startswith(('http://', 'https://')):
        return jsonify(status='error', msg='头像需为 http(s) 图片链接'), 400

    user = current_user
    user.nickname = nickname or None
    user.avatar = avatar or None
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：系统设置（每行链接数 / 登录保持天数）
# ----------------------------------------------------------------------
@bp.route('/settings/system', methods=['POST'])
@login_required
def settings_system():
    data = request.get_json(silent=True) or {}
    settings = get_settings(current_user)

    # 注：每行列数现已下放到「分组设置」（Group.links_per_row / links_per_row_rect），
    # 此处仅保留登录保持天数、打开方式等用户级设置，以及「全部链接页」的全局每行数量。
    # 站点品牌（site_name/site_title/site_subtitle/site_logo）已迁到 SiteSettings
    # 由「/api/site」读写，不再混入用户设置。

    # 全部链接 / 未分组页面的每行卡片数（card 样式 1~8）。具体分组页仍由分组设置控制。
    raw_cols = data.get('links_per_row')
    if raw_cols is not None:
        try:
            cols = int(raw_cols)
        except (TypeError, ValueError):
            return jsonify(status='error', msg='每行数量必须为整数'), 400
        if not (1 <= cols <= 8):
            return jsonify(status='error', msg='每行数量需在 1~8 之间'), 400
        settings.links_per_row = cols

    # 全部链接 / 未分组页面的 Dock 放大倍数基准（1.0~2.5，与分组设置同区间）
    raw_dock = data.get('dock_scale')
    if raw_dock is not None:
        try:
            dock = float(raw_dock)
        except (TypeError, ValueError):
            return jsonify(status='error', msg='Dock 放大倍数必须为数字'), 400
        if not (1.0 <= dock <= 2.5):
            return jsonify(status='error', msg='Dock 放大倍数需在 1.0~2.5 之间'), 400
        settings.dock_scale = dock

    # 登录保持天数：可选。前端未传时保留原值（避免把必填项强加给"每行/打开方式"保存）
    raw_days = data.get('session_days')
    if raw_days is not None:
        try:
            session_days = int(raw_days)
        except (TypeError, ValueError):
            return jsonify(status='error', msg='登录保持天数必须为整数'), 400
        if not (1 <= session_days <= 365):
            return jsonify(status='error', msg='登录保持天数需在 1~365 之间'), 400
        settings.session_days = session_days

    # 链接打开方式：1=新窗口，0=本窗口（前端传字符串 "1"/"0"）
    raw_open = data.get('open_in_new')
    if raw_open is not None:
        try:
            settings.open_in_new = bool(int(raw_open))
        except (TypeError, ValueError):
            return jsonify(status='error', msg='打开方式参数错误'), 400

    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：修改密码（校验当前密码，验证新密码强度与一致性）
# ----------------------------------------------------------------------
@bp.route('/settings/password', methods=['POST'])
@login_required
def settings_password():
    data = request.get_json(silent=True) or {}
    old_p = (data.get('old_password') or '')
    new_p = (data.get('new_password') or '')
    confirm = (data.get('confirm_password') or '')

    # 必须提供正确的当前密码，防止会话被冒用时静默改密
    if not current_user.check_password(old_p):
        return jsonify(status='error', msg='当前密码不正确'), 400
    # 新密码强度与一致性校验
    if len(new_p) < 6:
        return jsonify(status='error', msg='新密码至少 6 位'), 400
    if new_p != confirm:
        return jsonify(status='error', msg='两次输入的新密码不一致'), 400

    current_user.set_password(new_p)   # 始终以哈希形式存储，绝不存明文
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：默认首页（'all' 或 'group:<id>'）
# ----------------------------------------------------------------------
@bp.route('/settings/home', methods=['POST'])
@login_required
def settings_home():
    data = request.get_json(silent=True) or {}
    val = (data.get('default_home') or 'all').strip()
    # 仅允许 'all' 或 'group:<正整数>'；其余视为非法，防止把任意字符串存进设置
    if val != 'all' and not re.match(r'^group:\d+$', val):
        return jsonify(status='error', msg='非法的首页设置'), 400
    settings = get_settings(current_user)
    settings.default_home = None if val == 'all' else val
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：总站默认进入页面（'nav' 导航页面 / 'workbench' 工作台）
# ----------------------------------------------------------------------
@bp.route('/settings/view', methods=['POST'])
@login_required
def settings_view():
    data = request.get_json(silent=True) or {}
    val = (data.get('default_view') or 'nav').strip()
    # 仅允许 'nav' 或 'workbench'；其余视为非法，防止把任意字符串存进设置
    if val not in ('nav', 'workbench'):
        return jsonify(status='error', msg='非法的默认页面设置'), 400
    settings = get_settings(current_user)
    settings.default_view = val
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：导航分类默认进入的子视图（'nav' 导航视图 / 'overview' 总览视图）
# ----------------------------------------------------------------------
@bp.route('/settings/nav-view', methods=['POST'])
@login_required
def settings_nav_view():
    data = request.get_json(silent=True) or {}
    val = (data.get('default_nav_view') or 'nav').strip()
    # 仅允许 'nav' 或 'overview'；其余视为非法，防止把任意字符串存进设置
    if val not in ('nav', 'overview'):
        return jsonify(status='error', msg='非法的默认导航视图设置'), 400
    settings = get_settings(current_user)
    settings.default_nav_view = val
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：是否开放注册（站点级全局开关）
# ----------------------------------------------------------------------
@bp.route('/settings/register-open', methods=['POST'])
@login_required
@admin_required
def settings_register_open():
    data = request.get_json(silent=True) or {}
    try:
        open_flag = bool(int(data.get('open', 1)))
    except (TypeError, ValueError):
        return jsonify(status='error', msg='参数错误'), 400
    ss = get_site_settings()
    ss.allow_register = open_flag
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 站点：站点级配置（公开读 / 登录写）
# - GET  /api/site              公开：未登录也可拉取品牌（首页/浏览器标签需要）
# - POST /api/site              登录：改站点名称/标题/副标题/logo 全站生效
# ----------------------------------------------------------------------
@bp.route('/api/site')
def api_site_get():
    """站点级设置：未登录也可读，便于登录页/文档标题复用品牌。"""
    return jsonify(status='ok', **site_to_dict(get_site_settings()))


@bp.route('/api/site', methods=['POST'])
@login_required
@admin_required
def api_site_set():
    """更新站点级设置（系统设置 → 全站统一一套品牌）。

    接受 site_name/site_title/site_subtitle/site_logo 任意子集；
    仅当显式传入（含空串）才更新，未传则保留原值。
    字符串长度按模型列宽截断，避免越界。
    """
    data = request.get_json(silent=True) or {}
    ss = get_site_settings()
    _SITE_FIELD_LIMITS = {
        'site_name': 64,
        'site_title': 128,
        'site_subtitle': 128,
        'site_logo': 512,
        'font_sans': 256,
        'font_cjk': 256,
    }
    for field, limit in _SITE_FIELD_LIMITS.items():
        if field in data:
            val = data.get(field) or ''
            if not isinstance(val, str):
                return jsonify(status='error', msg=f'{field} 必须为字符串'), 400
            setattr(ss, field, val[:limit])
    from datetime import datetime, timezone
    ss.site_updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：自定义配色 —— 新建
# 接收 JSON：{ name, primary, secondary, background, text, accent }（均为 #rrggbb）
# ----------------------------------------------------------------------
@bp.route('/settings/custom-theme', methods=['POST'])
@login_required
def custom_theme_create():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    primary = (data.get('primary') or '').strip()
    secondary = (data.get('secondary') or '').strip()
    background = (data.get('background') or '').strip()
    text = (data.get('text') or '').strip()
    # 强调色：留空时回退默认 amber，避免前端漏传导致库里 NULL
    accent = (data.get('accent') or '').strip() or '#f59e0b'

    # 全部必须为合法 #rrggbb 十六进制
    for c in (primary, secondary, background, text, accent):
        if not re.match(r'^#?[0-9a-fA-F]{6}$', c or ''):
            return jsonify(status='error', msg='颜色格式不正确（需 #rrggbb）'), 400

    ct = CustomTheme(
        user_id=current_user.id,
        name=name[:40] or '我的配色',
        primary=primary,
        secondary=secondary,
        background=background,
        text=text,
        accent=accent,
    )
    db.session.add(ct)
    db.session.commit()
    return jsonify(status='ok', id=ct.id)


# ----------------------------------------------------------------------
# 设置：自定义配色 —— 删除（只能删自己的）
# ----------------------------------------------------------------------
@bp.route('/settings/custom-theme/<int:cid>/delete', methods=['POST'])
@login_required
def custom_theme_delete(cid):
    ct = db.session.get(CustomTheme, cid)
    if ct is None:
        abort(404)
    if ct.user_id != current_user.id:        # 越权防护
        abort(403)
    # 若该配色正被使用，则把对应用户的设置回退为 light
    UserSettings.query.filter_by(user_id=current_user.id, theme=f'custom:{cid}').update(
        {UserSettings.theme: 'light'})
    db.session.delete(ct)
    db.session.commit()
    return jsonify(status='ok')


# ----------------------------------------------------------------------
# 设置：自定义配色 —— 编辑（只能改自己的）
# 接收 JSON：{ name?, primary?, secondary?, background?, text?, accent? }（均为 #rrggbb）
# 任意字段缺省则保留原值
# 注：沿用本项目「写操作统一 POST」约定（与删除路由一致），故用 POST 而非 PUT
# ----------------------------------------------------------------------
@bp.route('/settings/custom-theme/<int:cid>', methods=['POST'])
@login_required
def custom_theme_update(cid):
    ct = db.session.get(CustomTheme, cid)
    if ct is None:
        abort(404)
    if ct.user_id != current_user.id:        # 越权防护
        abort(403)
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip() or ct.name
    primary = (data.get('primary') or '').strip() or ct.primary
    secondary = (data.get('secondary') or '').strip() or ct.secondary
    background = (data.get('background') or '').strip() or ct.background
    text = (data.get('text') or '').strip() or ct.text
    accent = (data.get('accent') or '').strip() or ct.accent

    # 全部必须为合法 #rrggbb 十六进制（若传了非法值则报错，避免库里 NULL/脏数据）
    for c in (primary, secondary, background, text, accent):
        if not re.match(r'^#?[0-9a-fA-F]{6}$', c or ''):
            return jsonify(status='error', msg='颜色格式不正确（需 #rrggbb）'), 400

    ct.name = name[:40]
    ct.primary = primary
    ct.secondary = secondary
    ct.background = background
    ct.text = text
    ct.accent = accent
    db.session.commit()
    return jsonify(status='ok', id=ct.id)


# ----------------------------------------------------------------------
# 根据 URL 抓取目标网站标题（新增/编辑链接时，点"自动获取"按钮调用）
# 安全：仅允许 http/https；轻量 SSRF 防护（阻断回环 / 内网地址）；限制读取字节与时间
# ----------------------------------------------------------------------
@bp.route('/link/fetch-title', methods=['POST'])
@login_required
def fetch_title():
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify(status='error', msg='请先填写 URL'), 400

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return jsonify(status='error', msg='仅支持 http/https 链接'), 400

    # 轻量 SSRF 防护：阻断明显的内网 / 回环地址（个人工具场景下的最佳努力）
    host = parsed.hostname.lower()
    if (host in ('localhost', '0.0.0.0', '::1')
            or host.endswith('.local') or host.endswith('.internal')
            or host.startswith('127.')
            or host.startswith('10.')
            or host.startswith('192.168.')
            or host.startswith('169.254.')
            or re.match(r'^172\.(1[6-9]|2[0-9]|3[01])\.', host)):
        return jsonify(status='error', msg='不支持获取该地址的标题'), 400

    try:
        req = urllib.request.Request(
            url, method='GET',
            headers={'User-Agent': 'Mozilla/5.0 (compatible; EigerNav/1.0)'}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            raw = resp.read(65536).decode('utf-8', 'ignore')
        m = re.search(r'<title[^>]*>(.*?)</title>', raw, re.IGNORECASE | re.DOTALL)
        title = m.group(1).strip() if m else ''
        title = re.sub(r'\s+', ' ', title)[:200]
        if not title:
            return jsonify(status='error', msg='该页面未包含可用标题'), 400
        return jsonify(status='ok', title=title)
    except Exception:
        return jsonify(status='error', msg='获取标题失败，请手动填写'), 400


# ----------------------------------------------------------------------
# 批量操作链接（编辑模式使用）：移动分组 / 删除
# 接收 JSON：{ action: 'move'|'delete', ids: [int...], group_id?: int }
# 仅处理属于当前用户的链接（越权防护）
# ----------------------------------------------------------------------
@bp.route('/batch', methods=['POST'])
@login_required
def batch_links():
    data = request.get_json(silent=True) or {}
    action = data.get('action')
    ids = data.get('ids', [])
    if not isinstance(ids, list):
        return jsonify(status='error', msg='ids 格式错误'), 400
    ids = [i for i in ids if isinstance(i, int)]

    links = Link.query.filter(Link.id.in_(ids), Link.user_id == current_user.id).all()
    if action == 'delete':
        for l in links:
            db.session.delete(l)
        db.session.commit()
        return jsonify(status='ok')

    if action == 'move':
        # group_id=0 表示"未分组"
        gid = data.get('group_id')
        gid = gid if gid else None
        for l in links:
            l.group_id = gid
        db.session.commit()
        return jsonify(status='ok')

    return jsonify(status='error', msg='未知操作'), 400


# ----------------------------------------------------------------------
# 数据导入 / 导出
# 端点：
#   GET  /data/export/<fmt>   fmt ∈ {json, xlsx, html}  下载当前用户的全部业务数据
#   POST /data/import         接收上传文件（json/xlsx/html），非破坏性合并导入
# 均为登录后才可用；CSRF 防护由全局 csrf 接管（前端 fetch 带 X-CSRFToken 头）。
# ----------------------------------------------------------------------
@bp.route('/data/export/<fmt>')
@login_required
@admin_required
def data_export(fmt):
    fmt = fmt.lower()
    if fmt == 'json':
        buf, mimetype, fname = dataio.export_json(current_user)
    elif fmt in ('xlsx', 'excel'):
        buf, mimetype, fname = dataio.export_xlsx(current_user)
    elif fmt == 'html':
        buf, mimetype, fname = dataio.export_html(current_user)
    else:
        abort(404)
    return send_file(
        buf,
        mimetype=mimetype,
        as_attachment=True,
        download_name=fname,
        max_age=0,
    )


@bp.route('/data/import', methods=['POST'])
@login_required
@admin_required
def data_import():
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify(status='error', msg='未收到文件'), 400

    filename = upload.filename.lower()
    raw = upload.read()

    # 通过后缀判定格式；再交给 dataio 解析（HTML 会回退到内嵌 JSON）
    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        fmt = 'xlsx'
    elif filename.endswith('.html') or filename.endswith('.htm'):
        fmt = 'html'
    elif filename.endswith('.json'):
        fmt = 'json'
    else:
        # 无后缀时尝试按内容探测
        head = raw.lstrip()[:1]
        fmt = 'json' if head.startswith(b'{') else 'html'

    payload, err = dataio._parse_payload(raw, fmt)
    if err:
        return jsonify(status='error', msg=err), 400

    try:
        stats = dataio.import_payload(current_user, payload)
    except Exception as e:  # 导入失败要回滚，避免半成品数据
        db.session.rollback()
        current_app.logger.exception('数据导入失败')
        return jsonify(status='error', msg=f'导入失败：{e}'), 500

    return jsonify(status='ok', stats=stats)


@bp.route('/data/backup')
@login_required
@admin_required
def data_backup():
    buf, mimetype, fname = dataio.backup_full(current_user)
    return send_file(
        buf,
        mimetype=mimetype,
        as_attachment=True,
        download_name=fname,
        max_age=0,
    )


@bp.route('/data/restore', methods=['POST'])
@login_required
@admin_required
def data_restore():
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify(status='error', msg='未收到文件'), 400
    raw = upload.read()
    stats, err = dataio.restore_full(current_user, raw)
    if err:
        return jsonify(status='error', msg=err), 400
    return jsonify(status='ok', stats=stats)


# ======================================================================
# 管理员：用户管理（仅管理员可访问；不能操作管理员自身账号）
#   列出所有用户 / 编辑（昵称、重置密码）/ 删除（级联清理其数据）
# ----------------------------------------------------------------------
@bp.route('/api/admin/users')
@login_required
@admin_required
def admin_list_users():
    users = User.query.order_by(User.id).all()
    return jsonify(status='ok', users=[user_to_dict(u) for u in users])


@bp.route('/api/admin/users/<int:user_id>', methods=['POST'])
@login_required
@admin_required
def admin_update_user(user_id):
    # 禁止编辑管理员自身：管理员自身的昵称/密码在「个人中心」修改，避免误操作
    if user_id == current_user.id:
        return jsonify(status='error', msg='不能编辑管理员自身账号'), 400
    u = User.query.get(user_id)
    if u is None:
        return jsonify(status='error', msg='用户不存在'), 404

    data = request.get_json(silent=True) or {}
    # 昵称：可选更新（空串视为清空）
    if 'nickname' in data:
        nn = (data.get('nickname') or '')
        if len(nn) > 80:
            return jsonify(status='error', msg='昵称过长'), 400
        u.nickname = nn or None
    # 重置密码：可选；需 new_password 与 confirm_password 一致、且 ≥6 位
    new_p = data.get('new_password')
    if new_p:
        confirm = data.get('confirm_password') or ''
        if len(new_p) < 6:
            return jsonify(status='error', msg='新密码至少 6 位'), 400
        if new_p != confirm:
            return jsonify(status='error', msg='两次输入的新密码不一致'), 400
        u.set_password(new_p)

    db.session.commit()
    return jsonify(status='ok', user=user_to_dict(u))


@bp.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def admin_delete_user(user_id):
    # 禁止删除管理员自身：避免锁死唯一的管理员账号导致无人能管理后台
    if user_id == current_user.id:
        return jsonify(status='error', msg='不能删除管理员自身账号'), 400
    u = User.query.get(user_id)
    if u is None:
        return jsonify(status='error', msg='用户不存在'), 404

    # 级联删除：User.links / groups / settings / custom_themes 已配 cascade，
    # 删除用户时自动清理；WorkbenchState 仅有外键、无 cascade，需手动清理，
    # 否则触发外键约束错误（SQLite/外键开启时）。
    WorkbenchState.query.filter_by(user_id=user_id).delete()
    db.session.delete(u)
    db.session.commit()
    return jsonify(status='ok')


# ======================================================================
# 阶段 0：读接口（JSON API）
# ----------------------------------------------------------------------
# 统一响应约定（与现有 20+ 写 API 同形）：
#   成功：{ "status": "ok", ...业务字段 }
#   失败：{ "status": "error", "msg": "..." }  （附 HTTP 状态码）
# CSRF：所有非 GET 接口需在请求头带 X-CSRF-Token（取自 meta[name=csrf-token]）；
#       认证类接口（login/logout/auth/me）免 CSRF，便于 SPA 在未登录态完成登录握手。
# 现有 dashboard() 整页渲染与全部写 API 保持不变，前端可逐步切换消费本接口。
# ======================================================================


@bp.route('/api/auth/me')
def api_auth_me():
    """返回当前登录用户；未登录返回 401。供 SPA 判定登录态。"""
    if not current_user.is_authenticated:
        return jsonify(status='error', msg='未登录'), 401
    return jsonify(status='ok', **user_to_dict(current_user))


@bp.route('/api/login', methods=['POST'])
@csrf.exempt
def api_login():
    """JSON 登录：{username, password, remember?}。校验通过写 session-cookie。"""
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        days = get_settings(user).session_days
        login_user(user, remember=True, duration=timedelta(days=days))
        return jsonify(status='ok', **user_to_dict(user))
    return jsonify(status='error', msg='用户名或密码错误'), 401


@bp.route('/api/logout', methods=['POST'])
@csrf.exempt
def api_logout():
    """退出登录。"""
    logout_user()
    return jsonify(status='ok')


@bp.route('/api/csrf-token', methods=['GET'])
@csrf.exempt
def api_csrf_token():
    """返回当前会话的 CSRF 令牌，供 SPA 写入 meta 并经 X-CSRF-Token 头发送。

    免 CSRF（否则会出现「为拿令牌而需先有令牌」的死锁）。令牌由 flask_wtf 的
    generate_csrf() 依据会话密钥生成，与全局 CSRFProtect 校验同源。
    """
    token = generate_csrf()
    return jsonify(status='ok', token=token)


@bp.route('/api/categories')
def api_categories():
    """顶层分类列表（复用 app/categories.py）。?cat= 指定当前激活分类。"""
    from .categories import ordered_categories, default_category
    cat = request.args.get('cat') or default_category()
    return jsonify(status='ok', items=ordered_categories(), current=cat)


@bp.route('/api/groups')
@login_required
def api_groups():
    """导航视图数据：分组列表（含嵌套链接）+ 未分组段。?category= 默认 nav。"""
    category = request.args.get('category') or 'nav'
    groups = (Group.query.filter_by(user_id=current_user.id, category=category)
              .order_by(Group.sort_order, Group.created_at).all())
    groups_data = []
    for g in groups:
        links = (Link.query.filter_by(user_id=current_user.id, group_id=g.id)
                 .order_by(Link.sort_order, Link.created_at).all())
        groups_data.append(group_to_dict(g, links=links))

    ungrouped = (Link.query.filter_by(user_id=current_user.id, group_id=None)
                 .order_by(Link.sort_order, Link.created_at).all())
    ungrouped_data = {
        'id': 0, 'name': '未分组', 'count': len(ungrouped),
        'links': [link_to_dict(l) for l in ungrouped],
    }
    return jsonify(status='ok', groups=groups_data, ungrouped=ungrouped_data)


@bp.route('/api/links')
@login_required
def api_links():
    """局部刷新通道：某分组（或全部链接页的未分组段）的链接。?group=<id|0>。"""
    category = request.args.get('category') or 'nav'
    group_arg = request.args.get('group', type=int)

    if group_arg is not None and group_arg != 0:
        # 校验该分组确实属于当前用户且属于当前分类（越权防护）
        g = Group.query.filter_by(id=group_arg, user_id=current_user.id, category=category).first()
        if not g:
            return jsonify(status='error', msg='分组不存在'), 404
        links = (Link.query.filter_by(user_id=current_user.id, group_id=group_arg)
                 .order_by(Link.sort_order, Link.created_at).all())
    else:
        # group 缺失或 0 → 未分组段
        links = (Link.query.filter_by(user_id=current_user.id, group_id=None)
                 .order_by(Link.sort_order, Link.created_at).all())

    return jsonify(status='ok', group_id=group_arg or 0, links=[link_to_dict(l) for l in links])


@bp.route('/api/overview-sections')
@login_required
def api_overview_sections():
    """总览视图数据：所有分组（含未分组）的分段，逐段携带其卡片设置。"""
    sections = _build_overview_sections(current_user)
    data = []
    total = 0
    for s in sections:
        data.append({
            'id': s['id'], 'name': s['name'], 'icon': s['icon'], 'is_rect': s['is_rect'],
            'cols': s['cols'], 'title_fs': s['title_fs'], 'maxlen': s['maxlen'],
            'show_title': s['show_title'], 'dock_scale': s['dock_scale'],
            'row_gap': s['row_gap'], 'col_gap': s['col_gap'],
            'links': [link_to_dict(l) for l in s['links']],
        })
        total += len(s['links'])
    return jsonify(status='ok', sections=data, total=total)


@bp.route('/api/settings')
@login_required
def api_settings():
    """当前用户的「用户级」设置。"""
    return jsonify(status='ok', **settings_to_dict(get_settings(current_user)))


@bp.route('/api/custom-themes')
@login_required
def api_custom_themes():
    """自定义配色列表 + 当前激活配色（'custom:<id>' 或 null）。"""
    cts = (CustomTheme.query.filter_by(user_id=current_user.id)
           .order_by(CustomTheme.created_at).all())
    active = None
    s = get_settings(current_user)
    if s.theme and s.theme.startswith('custom:'):
        active = s.theme
    return jsonify(status='ok', themes=[custom_theme_to_dict(c) for c in cts], active=active)
