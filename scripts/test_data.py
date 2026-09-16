"""
test_data.py —— praming 账户测试数据管理（创建 / 清理）
========================================================
用途：在当前阶段用于测试导航展示效果（Dock 放大、卡片样式、配色等）。
      测试完成后需要彻底删除这些测试数据。

用法（在 python-nav 项目根目录执行）：
  # 创建测试数据：praming 账户下 2 个分组，每组 50 条链接
  python scripts/test_data.py create

  # 清理测试数据：仅删除本脚本创建的测试分组与链接（按【测试】标记）
  python scripts/test_data.py clean

注意：
  - 测试分组/链接的 name/title 带【测试】前缀，clean 只删带此前缀的数据，不会影响真实数据。
  - 仅作用于 username='praming' 的账户。
"""
import sys

# 确保项目根目录在 sys.path 中
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import create_app, db
from app.models import User, Group, Link

# ---- 测试数据池 ----
# 分组定义：分组A=横排卡片(card)，分组B=方块(link)
GROUPS = [
    {
        "name": "【测试】常用导航",
        "icon": "compass",
        "card_style": "card",
        "links_per_row": 4,
        "links_per_row_rect": 12,
        "dock_scale": 1.4,
    },
    {
        "name": "【测试】资源库",
        "icon": "library",
        "card_style": "link",
        "links_per_row": 4,
        "links_per_row_rect": 12,
        "dock_scale": 1.6,
    },
]

# 50 个真实感标题（中文）
TITLES = [
    "搜索引擎", "邮箱", "云盘", "在线文档", "电子表格", "演示文稿", "日历",
    "笔记", "待办清单", "密码管理", "地图", "翻译", "天气预报", "新闻",
    "视频", "音乐", "图库", "设计工具", "代码托管", "代码仓库", "终端",
    "服务监控", "日志平台", "API 网关", "数据库", "服务器", "域名管理",
    "证书管理", "技术论坛", "个人博客", "开发者社区", "在线课程", "文档中心",
    "百科", "购物", "外卖", "出行", "酒店预订", "票务", "金融服务", "股票",
    "基金", "医保", "政务服务", "医疗服务", "在线教育", "招聘", "房源", "二手交易",
]

# Lucide 图标池
ICONS = [
    "globe", "mail", "cloud", "file-text", "table", "presentation", "calendar",
    "notebook", "list-todo", "key-round", "map", "languages", "cloud-sun",
    "newspaper", "play", "music", "image", "palette", "code", "git-branch",
    "terminal", "activity", "scroll-text", "webhook", "database", "server",
    "award", "messages-square", "pen", "users", "graduation-cap", "book-open",
    "book", "shopping-cart", "utensils", "plane", "hotel", "ticket", "landmark",
    "heart-pulse", "school", "briefcase", "house", "recycle",
]

# 柔和配色（莫兰迪/中国传统色系，#rrggbb）
COLORS = [
    "#A6B5C0", "#C2B8A3", "#B5C2A6", "#C0A6B5", "#A6C0B5", "#D2B48C", "#B0C4DE",
    "#C9C0BB", "#A8C0A0", "#C0A0A8", "#BCD4C0", "#E0C9B0", "#B8C4D0", "#D0C0B0",
    "#C4B0C0",
]

PER_GROUP = 50
SLUG = ["common", "resources"]


def create():
    app = create_app()
    with app.app_context():
        user = User.query.filter_by(username="praming").first()
        if not user:
            print("未找到 praming 账户，请先注册。")
            return

        # 幂等：先清理已存在的测试数据
        _clean_for_user(user)

        created_groups = 0
        created_links = 0
        for gi, g in enumerate(GROUPS):
            group = Group(
                user_id=user.id,
                name=g["name"],
                icon=g["icon"],
                sort_order=gi,
                card_style=g["card_style"],
                links_per_row=g["links_per_row"],
                links_per_row_rect=g["links_per_row_rect"],
                title_font_size="base",
                title_max_len=0,
                show_title=True,
                row_gap=16,
                col_gap=16,
                dock_scale=g["dock_scale"],
            )
            db.session.add(group)
            db.session.flush()  # 拿到 group.id
            created_groups += 1

            for i in range(PER_GROUP):
                title = f"{TITLES[i % len(TITLES)]} {i + 1:02d}"
                link = Link(
                    user_id=user.id,
                    group_id=group.id,
                    title=title,
                    url=f"https://example.com/{SLUG[gi]}/{i + 1}",
                    icon=ICONS[i % len(ICONS)],
                    note="测试数据" if i % 5 == 0 else None,
                    bg_color=COLORS[i % len(COLORS)],
                    title_color=None,
                    sort_order=i,
                )
                db.session.add(link)
                created_links += 1

        db.session.commit()
        print(f"已创建：{created_groups} 个测试分组，{created_links} 条测试链接（账户：praming）。")


def _clean_for_user(user):
    """删除 praming 账户下所有带【测试】标记的分组与链接（含其下链接）。"""
    groups = Group.query.filter_by(user_id=user.id).filter(
        Group.name.like("【测试】%")
    ).all()
    gids = [g.id for g in groups]
    if gids:
        links = Link.query.filter(
            Link.user_id == user.id, Link.group_id.in_(gids)
        ).all()
        for l in links:
            db.session.delete(l)
        for g in groups:
            db.session.delete(g)
        db.session.commit()


def clean():
    app = create_app()
    with app.app_context():
        user = User.query.filter_by(username="praming").first()
        if not user:
            print("未找到 praming 账户。")
            return
        # 统计
        before_g = Group.query.filter_by(user_id=user.id).filter(
            Group.name.like("【测试】%")
        ).count()
        gids = [g.id for g in Group.query.filter_by(user_id=user.id).filter(
            Group.name.like("【测试】%")
        ).all()]
        before_l = Link.query.filter(
            Link.user_id == user.id, Link.group_id.in_(gids)
        ).count() if gids else 0
        _clean_for_user(user)
        print(f"已清理：{before_g} 个测试分组，{before_l} 条测试链接。")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "create"
    if cmd == "create":
        create()
    elif cmd == "clean":
        clean()
    else:
        print("用法: python scripts/test_data.py [create|clean]")
