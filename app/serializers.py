"""
serializers.py —— ORM 模型 → API 字典的序列化辅助
================================================
供阶段 0 新增的「读接口」复用，把 Link / Group / CustomTheme / UserSettings /
User 转为前端 DTO 所需的字段，统一字段名与类型（日期统一 ISO8601 字符串）。

纯模块：仅依赖 models，不触碰 app / request，避免循环导入。
"""

from datetime import datetime, timezone


def _iso(dt):
    """把 datetime 转成带时区信息的 ISO8601 字符串；None 返回 None。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def link_to_dict(link):
    """导航链接 → 字典（字段与前端 DTO 对齐）。"""
    return {
        'id': link.id,
        'group_id': link.group_id,            # 未分组为 None
        'title': link.title,
        'url': link.url,
        'icon': link.icon,
        'icon_url': link.icon_url,
        'note': link.note,
        'bg_color': link.bg_color,
        'title_color': link.title_color,
        'sort_order': link.sort_order,
        'created_at': _iso(link.created_at),
    }


def group_to_dict(group, links=None):
    """分组 → 字典；links 为预查询好的该分组链接列表（按 sort_order 排好）。

    若不传 links，则不含嵌套链接字段（调用方按需组装）。
    """
    d = {
        'id': group.id,
        'name': group.name,
        'icon': group.icon,
        'sort_order': group.sort_order,
        'category': group.category,
        'card_style': group.card_style,
        'links_per_row': group.links_per_row,
        'links_per_row_rect': group.links_per_row_rect,
        'links_per_row_overview': group.links_per_row_overview,
        'links_per_row_rect_overview': group.links_per_row_rect_overview,
        'title_font_size': group.title_font_size,
        'title_max_len': group.title_max_len,
        'show_title': bool(group.show_title),
        'row_gap': group.row_gap,
        'col_gap': group.col_gap,
        'dock_scale': group.dock_scale,
        'created_at': _iso(group.created_at),
    }
    if links is not None:
        d['links'] = [link_to_dict(l) for l in links]
    return d


def custom_theme_to_dict(ct):
    """自定义配色 → 字典（前端用原始 hex 做色块预览）。"""
    return {
        'id': ct.id,
        'name': ct.name,
        'primary': ct.primary,
        'secondary': ct.secondary,
        'background': ct.background,
        'text': ct.text,
        'accent': ct.accent or '#f59e0b',
    }


def settings_to_dict(s):
    """用户设置 → 字典（阶段 0 仍为「用户级」设置；分类级设置后续迁入 CategorySettings）。

    站点品牌与开放注册开关等站点级配置从 SiteSettings（id=1）单独读，不再混入用户设置。
    """
    return {
        'theme': s.theme,
        'links_per_row': s.links_per_row,
        'links_per_row_rect': s.links_per_row_rect,
        'session_days': s.session_days,
        'open_in_new': bool(s.open_in_new),
        'default_home': s.default_home,
        'default_view': s.default_view or 'nav',
        'default_nav_view': s.default_nav_view or 'nav',
        'dock_scale': s.dock_scale,
        'default_category': s.default_category,
        'hidden_builtin_themes': [t for t in (s.hidden_builtin_themes or '').split(',') if t],
    }


def site_to_dict(ss):
    """站点设置（SiteSettings id=1） → 字典。

    - allow_register：是否开放注册（任何登录用户可读、可写）
    - site_name/site_title/site_subtitle/site_logo：站点品牌（任何登录用户可读、可写）
    """
    if ss is None:
        # 缺值兜底默认值（与模型一致）
        return {
            'allow_register': True,
            'site_name': 'Eiger',
            'site_title': '',
            'site_subtitle': '',
            'site_logo': '',
            'font_sans': "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            'font_cjk': "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }
    return {
        'allow_register': bool(ss.allow_register),
        'site_name': ss.site_name or 'Eiger',
        'site_title': ss.site_title or '',
        'site_subtitle': ss.site_subtitle or '',
        'site_logo': ss.site_logo or '',
        'font_sans': ss.font_sans or "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        'font_cjk': ss.font_cjk or "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    }


def user_to_dict(u):
    """用户 → 字典（登录态/资料展示用）。"""
    return {
        'id': u.id,
        'username': u.username,
        'nickname': u.nickname,
        'avatar': u.avatar,
        # is_admin 可能为 None（老数据尚未迁移），统一兜底为布尔
        'is_admin': bool(u.is_admin),
    }
