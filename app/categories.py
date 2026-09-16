"""categories.py —— 顶层分类（导航 / 工作台 / 资讯）配置

分类是比「分组」更高一层的模块维度。当前所有功能都属于「导航」类，
后续将增加「工作台」「资讯」等分类。加分类 = 加一项配置 + 一个模块，
因此用配置常量列表承载，而非数据库表（保持类型安全、扩展简单）。

字段说明（每个分类字典）：
  id      : 唯一标识，用于路由与判定（如 'nav'）
  name    : 中文展示名
  icon    : Lucide 图标名（顶栏切换器渲染）
  order   : 排序，越小越靠前
  enabled : 是否已上线；False 时在顶栏以禁用占位灰显
"""

CATEGORIES = [
    {"id": "nav", "name": "导航", "icon": "compass", "order": 1, "enabled": True},
    {"id": "workbench", "name": "工作台", "icon": "layout-dashboard", "order": 2, "enabled": False},
    {"id": "news", "name": "资讯", "icon": "newspaper", "order": 3, "enabled": False},
]


def get_category(cat_id):
    """按 id 返回分类字典；不存在返回 None。"""
    for c in CATEGORIES:
        if c["id"] == cat_id:
            return c
    return None


def default_category():
    """返回默认激活的分类 id（首个已上线的分类）。"""
    for c in ordered_categories():
        if c.get("enabled", True):
            return c["id"]
    return CATEGORIES[0]["id"] if CATEGORIES else "nav"


def ordered_categories():
    """返回按 order 升序排列的分类列表（含未上线的占位）。"""
    return sorted(CATEGORIES, key=lambda c: c.get("order", 0))
