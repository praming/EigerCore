"""
dataio.py —— 用户数据的导入 / 导出
====================================
把当前用户的全部业务数据（分组、链接、自定义配色、个人设置）打包为统一结构，
以支持多种格式的导出与导入：

  - JSON ：结构化、无损、可读，作为其它格式的"单一事实来源"。
  - XLSX ：表格化，便于在 Excel / WPS / 在线表格里查看与批量编辑。
  - HTML ：自包含的可视化网页（可双击打开浏览），内嵌 JSON 以便原样回灌。

导入时按「业务主键」做非破坏性合并（merge）：
  - 分组      ：按 (user_id, name) 匹配，存在则更新字段，不存在则新建。
  - 链接      ：按 (group_id, title, url) 匹配（未分组按 user_id 级别），存在则更新，否则新建。
  - 自定义配色：按 (user_id, name) 匹配，存在则更新，否则新建。
  - 个人设置  ：直接套用到当前用户的 UserSettings（单例）。

密码哈希、其它用户的数据不会被触及。
"""

import io
import json
import os
import re
import zipfile
from datetime import datetime, timezone

from flask import current_app
from .models import db, User, Link, Group, UserSettings, CustomTheme

EXPORT_VERSION = 1
APP_TAG = "python-nav"

# 允许的颜色格式：#rgb / #rrggbb
_HEX_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')


# ---------------------------------------------------------------------------
# 1) 采集：把当前用户数据组装为统一的 payload（dict）
# ---------------------------------------------------------------------------
def build_payload(user):
    """采集 user 的全部业务数据，返回可被 JSON / XLSX / HTML 复用的 dict。"""
    settings = UserSettings.query.filter_by(user_id=user.id).first()

    groups_out = []
    for g in Group.query.filter_by(user_id=user.id).order_by(Group.sort_order, Group.id).all():
        links_out = []
        for lk in Link.query.filter_by(group_id=g.id).order_by(Link.sort_order, Link.id).all():
            links_out.append({
                "title": lk.title,
                "url": lk.url,
                "icon": lk.icon or "",
                "icon_url": lk.icon_url or "",
                "note": lk.note or "",
                "bg_color": lk.bg_color or "",
                "title_color": lk.title_color or "",
                "sort_order": lk.sort_order or 0,
            })
        groups_out.append({
            "name": g.name,
            "icon": g.icon or "",
            "sort_order": g.sort_order or 0,
            "card_style": g.card_style or "card",
            "links_per_row": g.links_per_row or 4,
            "links_per_row_rect": g.links_per_row_rect or 12,
            "title_font_size": g.title_font_size or "base",
            "title_max_len": g.title_max_len or 0,
            "show_title": bool(g.show_title),
            "row_gap": g.row_gap or 16,
            "col_gap": g.col_gap or 16,
            "dock_scale": g.dock_scale if g.dock_scale is not None else 1.4,
            "links": links_out,
        })

    themes_out = []
    for ct in CustomTheme.query.filter_by(user_id=user.id).order_by(CustomTheme.id).all():
        themes_out.append({
            "name": ct.name,
            "primary": ct.primary,
            "secondary": ct.secondary,
            "background": ct.background,
            "text": ct.text,
        })

    settings_out = {}
    if settings:
        settings_out = {
            "theme": settings.theme or "light",
            "links_per_row": settings.links_per_row or 4,
            "links_per_row_rect": settings.links_per_row_rect or 12,
            "session_days": settings.session_days or 7,
            "open_in_new": bool(settings.open_in_new),
            "default_home": settings.default_home or "all",
        }

    return {
        "app": APP_TAG,
        "version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "settings": settings_out,
        "groups": groups_out,
        "themes": themes_out,
    }


# ---------------------------------------------------------------------------
# 2) 导出
# ---------------------------------------------------------------------------
def export_json(user):
    payload = build_payload(user)
    data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    return io.BytesIO(data), "application/json", "nav-data.json"


def export_xlsx(user):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    payload = build_payload(user)
    wb = Workbook()

    head_fill = PatternFill("solid", fgColor="6366F1")
    head_font = Font(bold=True, color="FFFFFF")
    head_align = Alignment(horizontal="left", vertical="center")

    def style_header(ws, ncols):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = head_fill
            cell.font = head_font
            cell.alignment = head_align
        ws.freeze_panes = "A2"

    # —— 分组表 ——
    ws_g = wb.active
    ws_g.title = "分组"
    g_headers = ["名称", "图标", "排序", "卡片样式", "横排每行数", "矩形每行数",
                 "标题字号", "标题最大字符", "显示标题", "行间距", "列间距", "Dock放大"]
    ws_g.append(g_headers)
    for g in payload["groups"]:
        ws_g.append([
            g["name"], g["icon"], g["sort_order"], g["card_style"],
            g["links_per_row"], g["links_per_row_rect"], g["title_font_size"],
            g["title_max_len"], "是" if g["show_title"] else "否",
            g["row_gap"], g["col_gap"], g["dock_scale"],
        ])
    style_header(ws_g, len(g_headers))
    for i, w in enumerate([16, 12, 8, 10, 12, 12, 10, 14, 10, 8, 8, 10], start=1):
        ws_g.column_dimensions[chr(64 + i)].width = w

    # —— 链接表 ——
    ws_l = wb.create_sheet("链接")
    l_headers = ["所属分组", "标题", "网址", "图标", "图标URL", "备注",
                 "背景色", "标题色", "排序"]
    ws_l.append(l_headers)
    for g in payload["groups"]:
        for lk in g["links"]:
            ws_l.append([
                g["name"], lk["title"], lk["url"], lk["icon"], lk["icon_url"],
                lk["note"], lk["bg_color"], lk["title_color"], lk["sort_order"],
            ])
    style_header(ws_l, len(l_headers))
    for i, w in enumerate([16, 24, 50, 12, 36, 28, 10, 10, 8], start=1):
        ws_l.column_dimensions[chr(64 + i)].width = w

    # —— 自定义配色表 ——
    ws_t = wb.create_sheet("自定义配色")
    t_headers = ["名称", "主色", "辅色", "背景", "文字"]
    ws_t.append(t_headers)
    for ct in payload["themes"]:
        ws_t.append([ct["name"], ct["primary"], ct["secondary"],
                     ct["background"], ct["text"]])
    style_header(ws_t, len(t_headers))
    for i, w in enumerate([20, 12, 12, 12, 12], start=1):
        ws_t.column_dimensions[chr(64 + i)].width = w

    # —— 设置表 ——
    ws_s = wb.create_sheet("设置")
    ws_s.append(["项目", "值"])
    for k, v in payload["settings"].items():
        ws_s.append([k, str(v)])
    style_header(ws_s, 2)
    ws_s.column_dimensions["A"].width = 20
    ws_s.column_dimensions["B"].width = 30

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "nav-data.xlsx"


def export_html(user):
    payload = build_payload(user)
    data_json = json.dumps(payload, ensure_ascii=False)

    # 把分组/链接渲染成可视化卡片网格
    sections = []
    for g in payload["groups"]:
        cards = []
        for lk in g["links"]:
            style = ""
            if lk["bg_color"]:
                style += f"background:{lk['bg_color']};"
            if lk["title_color"]:
                style += f"color:{lk['title_color']};"
            cards.append(
                f'<a class="card" href="{_esc(lk["url"])}" target="_blank" rel="noopener" '
                f'style="{style}">'
                f'<span class="ctitle">{_esc(lk["title"])}</span>'
                f'<span class="cnote">{_esc(lk["note"])}</span></a>'
            )
        sections.append(
            f'<section><h2>{_esc(g["name"])}</h2>'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )

    theme_blocks = "".join(
        f'<span class="sw" style="background:{ct["primary"]}" title="{_esc(ct["name"])} 主色"></span>'
        f'<span class="sw" style="background:{ct["secondary"]}" title="辅色"></span>'
        f'<span class="sw" style="background:{ct["background"]}" title="背景"></span>'
        f'<span class="sw" style="background:{ct["text"]}" title="文字"></span>'
        for ct in payload["themes"]
    )

    html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>导航数据导出 · {_esc(user.username)}</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
         margin: 0; padding: 32px; background: #f7f7f8; color: #1f2937; }}
  h1 {{ font-size: 22px; margin: 0 0 4px; }}
  .meta {{ color: #6b7280; font-size: 13px; margin-bottom: 20px; }}
  .themes {{ display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px; }}
  .sw {{ width: 22px; height: 22px; border-radius: 6px; display: inline-block;
         box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }}
  section {{ margin-bottom: 28px; }}
  h2 {{ font-size: 16px; border-left: 4px solid #6366f1; padding-left: 8px; margin: 0 0 12px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }}
  .card {{ display: flex; flex-direction: column; gap: 2px; padding: 14px;
           background: #fff; border-radius: 12px; text-decoration: none; color: inherit;
           box-shadow: 0 1px 3px rgba(0,0,0,.08); transition: transform .15s, box-shadow .15s; }}
  .card:hover {{ transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,.12); }}
  .ctitle {{ font-weight: 600; font-size: 14px; word-break: break-all; }}
  .cnote {{ font-size: 12px; color: #6b7280; word-break: break-all; }}
</style></head>
<body>
  <h1>导航数据导出</h1>
  <div class="meta">用户：{_esc(user.username)} · 导出时间：{_esc(payload["exported_at"])} · 分组 {len(payload["groups"])} 个</div>
  <div class="themes">{theme_blocks or '<span style="color:#9ca3af;font-size:13px">（无自定义配色）</span>'}</div>
  {''.join(sections) or '<p style="color:#6b7280">（暂无分组数据）</p>'}
  <!-- 还原锚点：导入功能可解析此处的 JSON 原样回灌 -->
  <script type="application/json" id="nav-export-data">{data_json}</script>
</body></html>"""
    return io.BytesIO(html.encode("utf-8")), "text/html", "nav-data.html"


# ---------------------------------------------------------------------------
# 3) 导入
# ---------------------------------------------------------------------------
def _clean_hex(v):
    """仅允许合法 #rgb / #rrggbb，否则返回空串。"""
    return v if (v and _HEX_RE.match(v)) else ""


def _parse_payload(data, fmt):
    """把不同格式的输入统一解析为 payload dict；非法则返回 (None, 错误信息)。"""
    if fmt == "json":
        try:
            obj = json.loads(data.decode("utf-8"))
        except Exception as e:
            return None, f"JSON 解析失败：{e}"
    elif fmt == "html":
        # 从内嵌 <script id="nav-export-data"> 提取 JSON
        m = re.search(r'<script[^>]*id="nav-export-data"[^>]*>(.*?)</script>',
                      data.decode("utf-8", "ignore"), re.S)
        if not m:
            return None, "未在 HTML 中找到导出数据锚点（nav-export-data）。"
        try:
            obj = json.loads(m.group(1))
        except Exception as e:
            return None, f"HTML 内嵌 JSON 解析失败：{e}"
    elif fmt == "xlsx":
        try:
            obj = _xlsx_to_payload(data)
        except Exception as e:
            return None, f"Excel 解析失败：{e}"
    else:
        return None, f"不支持的格式：{fmt}"

    if not isinstance(obj, dict) or obj.get("app") != APP_TAG:
        return None, "文件格式不匹配（非本应用导出文件）。"
    return obj, None


def _xlsx_to_payload(data):
    """读取 xlsx 字节，重建与 build_payload 一致的 dict 结构。"""
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), data_only=True)

    def rows(sheet):
        ws = wb[sheet]
        it = ws.iter_rows(values_only=True)
        header = [str(h).strip() if h is not None else "" for h in next(it, [])]
        out = []
        for r in it:
            if all(c is None for c in r):
                continue
            out.append({header[i]: r[i] for i in range(len(header))})
        return out

    def cell(row, key, default=""):
        v = row.get(key, default)
        return "" if v is None else str(v).strip()

    def as_int(v, default=0):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return default

    def as_bool(v):
        return str(v).strip() in ("是", "True", "true", "1", "YES", "yes")

    groups = []
    if "分组" in wb.sheetnames:
        for r in rows("分组"):
            gname = cell(r, "名称")
            if not gname:
                continue
            groups.append({
                "name": gname,
                "icon": cell(r, "图标"),
                "sort_order": as_int(cell(r, "排序"), 0),
                "card_style": cell(r, "卡片样式", "card") or "card",
                "links_per_row": as_int(cell(r, "横排每行数"), 4),
                "links_per_row_rect": as_int(cell(r, "矩形每行数"), 12),
                "title_font_size": cell(r, "标题字号", "base") or "base",
                "title_max_len": as_int(cell(r, "标题最大字符"), 0),
                "show_title": as_bool(cell(r, "显示标题", "是")),
                "row_gap": as_int(cell(r, "行间距"), 16),
                "col_gap": as_int(cell(r, "列间距"), 16),
                "dock_scale": (float(cell(r, "Dock放大")) if cell(r, "Dock放大") else 1.4),
                "links": [],
            })
    gmap = {g["name"]: g for g in groups}

    if "链接" in wb.sheetnames:
        for r in rows("链接"):
            gname = cell(r, "所属分组")
            g = gmap.get(gname) or next((x for x in groups), None)
            if not g:
                continue
            title = cell(r, "标题")
            url = cell(r, "网址")
            if not (title and url):
                continue
            g["links"].append({
                "title": title,
                "url": url,
                "icon": cell(r, "图标"),
                "icon_url": cell(r, "图标URL"),
                "note": cell(r, "备注"),
                "bg_color": _clean_hex(cell(r, "背景色")),
                "title_color": _clean_hex(cell(r, "标题色")),
                "sort_order": as_int(cell(r, "排序"), 0),
            })

    themes = []
    if "自定义配色" in wb.sheetnames:
        for r in rows("自定义配色"):
            name = cell(r, "名称")
            if not name:
                continue
            themes.append({
                "name": name,
                "primary": _clean_hex(cell(r, "主色")) or "#6366f1",
                "secondary": _clean_hex(cell(r, "辅色")) or "#a855f7",
                "background": _clean_hex(cell(r, "背景")) or "#ffffff",
                "text": _clean_hex(cell(r, "文字")) or "#1f2937",
            })

    settings = {}
    if "设置" in wb.sheetnames:
        for r in rows("设置"):
            k = cell(r, "项目")
            v = cell(r, "值")
            if k:
                settings[k] = v

    return {
        "app": APP_TAG,
        "version": EXPORT_VERSION,
        "exported_at": "",
        "settings": settings,
        "groups": groups,
        "themes": themes,
    }


def import_payload(user, payload):
    """把 payload 非破坏性地合并进 user 的现有数据，返回统计信息 dict。"""
    stats = {"groups": 0, "links": 0, "themes": 0, "settings": False}

    # —— 分组 + 链接 ——
    for g in payload.get("groups", []):
        gname = (g.get("name") or "").strip()
        if not gname:
            continue
        grp = Group.query.filter_by(user_id=user.id, name=gname).first()
        if grp is None:
            grp = Group(user_id=user.id, name=gname)
            db.session.add(grp)
        grp.icon = g.get("icon") or grp.icon
        grp.sort_order = g.get("sort_order", grp.sort_order or 0)
        grp.card_style = g.get("card_style") or grp.card_style or "card"
        grp.links_per_row = g.get("links_per_row", grp.links_per_row or 4)
        grp.links_per_row_rect = g.get("links_per_row_rect", grp.links_per_row_rect or 12)
        grp.title_font_size = g.get("title_font_size") or grp.title_font_size or "base"
        grp.title_max_len = g.get("title_max_len", grp.title_max_len or 0)
        grp.show_title = g.get("show_title", grp.show_title if grp.show_title is not None else True)
        grp.row_gap = g.get("row_gap", grp.row_gap or 16)
        grp.col_gap = g.get("col_gap", grp.col_gap or 16)
        grp.dock_scale = g.get("dock_scale", grp.dock_scale if grp.dock_scale is not None else 1.4)
        db.session.flush()  # 拿到 grp.id 供链接关联
        stats["groups"] += 1

        for lk in g.get("links", []):
            title = (lk.get("title") or "").strip()
            url = (lk.get("url") or "").strip()
            if not (title and url):
                continue
            link = Link.query.filter_by(group_id=grp.id, title=title, url=url).first()
            if link is None:
                link = Link(user_id=user.id, group_id=grp.id, title=title, url=url)
                db.session.add(link)
            link.icon = lk.get("icon") or link.icon
            link.icon_url = lk.get("icon_url") or link.icon_url
            link.note = lk.get("note") or link.note
            link.bg_color = _clean_hex(lk.get("bg_color")) or link.bg_color
            link.title_color = _clean_hex(lk.get("title_color")) or link.title_color
            link.sort_order = lk.get("sort_order", link.sort_order or 0)
            stats["links"] += 1

    # —— 自定义配色 ——
    for ct in payload.get("themes", []):
        name = (ct.get("name") or "").strip()
        if not name:
            continue
        theme = CustomTheme.query.filter_by(user_id=user.id, name=name).first()
        if theme is None:
            theme = CustomTheme(user_id=user.id, name=name)
            db.session.add(theme)
        theme.primary = _clean_hex(ct.get("primary")) or theme.primary or "#6366f1"
        theme.secondary = _clean_hex(ct.get("secondary")) or theme.secondary or "#a855f7"
        theme.background = _clean_hex(ct.get("background")) or theme.background or "#ffffff"
        theme.text = _clean_hex(ct.get("text")) or theme.text or "#1f2937"
        stats["themes"] += 1

    # —— 个人设置 ——
    s = payload.get("settings") or {}
    if s:
        us = UserSettings.query.filter_by(user_id=user.id).first()
        if us is None:
            us = UserSettings(user_id=user.id)
            db.session.add(us)
        if "theme" in s:
            us.theme = s["theme"] or "light"
        if "links_per_row" in s:
            us.links_per_row = int(s["links_per_row"]) if str(s["links_per_row"]).isdigit() else us.links_per_row
        if "links_per_row_rect" in s:
            us.links_per_row_rect = int(s["links_per_row_rect"]) if str(s["links_per_row_rect"]).isdigit() else us.links_per_row_rect
        if "session_days" in s:
            us.session_days = int(s["session_days"]) if str(s["session_days"]).isdigit() else us.session_days
        if "open_in_new" in s:
            us.open_in_new = str(s["open_in_new"]).strip().lower() in ("true", "1", "是", "yes")
        if "default_home" in s:
            us.default_home = s["default_home"] or "all"
        stats["settings"] = True

    db.session.commit()
    return stats


# ---------------------------------------------------------------------------
# 4) 全量备份 / 还原（方案 A：业务数据 JSON + 上传图标文件，打包为 ZIP）
# ---------------------------------------------------------------------------
# 与 routes.py 中 ICON_UPLOAD_DIR 保持一致（dataio 与 routes 同处 app/ 包内）
ICON_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'icons')


def backup_full(user):
    """把 user 的全部业务数据（JSON）+ 上传的图标文件打包为一个 ZIP 供下载。

    压缩包结构：
      backup.json        —— build_payload 的完整结果（分组 / 链接 / 配色 / 设置）
      icons/<filename>   —— 该用户链接所引用的本地上传图标文件（去重）

    返回 (buf, mimetype, filename)，可直接交给 send_file。
    """
    payload = build_payload(user)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('backup.json', json.dumps(payload, ensure_ascii=False, indent=2))
        # 收集该用户链接引用的本地图标文件，去重后写入 icons/
        seen = set()
        for g in payload.get('groups', []):
            for lk in g.get('links', []):
                iu = lk.get('icon_url') or ''
                if not iu.startswith('/static/uploads/icons/'):
                    continue
                fname = iu.rsplit('/', 1)[-1]
                if not fname or fname in seen:
                    continue
                seen.add(fname)
                src = os.path.join(ICON_UPLOAD_DIR, fname)
                if os.path.isfile(src):
                    with open(src, 'rb') as fh:
                        zf.writestr(f'icons/{fname}', fh.read())
    buf.seek(0)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    return buf, 'application/zip', f'nav-backup-{stamp}.zip'


def restore_full(user, raw):
    """解压 ZIP 备份并还原：数据走 import_payload 的非破坏性合并，图标文件写回上传目录。

    返回 (stats, err)：成功时 err 为 None；失败时 stats 为 None、err 为错误描述。
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except Exception as e:
        return None, f'备份文件解析失败（可能不是有效的 ZIP）：{e}'

    names = zf.namelist()
    if 'backup.json' not in names:
        return None, '备份文件中缺少 backup.json，可能不是本应用生成的备份。'

    try:
        payload = json.loads(zf.read('backup.json').decode('utf-8'))
    except Exception as e:
        return None, f'backup.json 解析失败：{e}'

    if not isinstance(payload, dict) or payload.get('app') != APP_TAG:
        return None, '备份文件格式不匹配（非本应用导出文件）。'

    # 1) 先恢复数据（数据库），失败则回滚、不写文件
    try:
        stats = import_payload(user, payload)
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception('数据还原失败')
        return None, f'还原失败：{e}'

    # 2) 图标文件写回（数据已成功提交，图标写回失败不影响整体还原）
    try:
        os.makedirs(ICON_UPLOAD_DIR, exist_ok=True)
        for n in names:
            if not n.startswith('icons/') or n.endswith('/'):
                continue
            base = os.path.basename(n)          # 净化文件名，杜绝路径穿越
            if not base:
                continue
            data = zf.read(n)
            dest = os.path.join(ICON_UPLOAD_DIR, base)
            with open(dest, 'wb') as fh:
                fh.write(data)
    except Exception as e:
        current_app.logger.warning('还原图标文件时出错：%s', e)

    return stats, None


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------
def _esc(s):
    """HTML 转义，防止导出网页里的用户文本破坏结构。"""
    if not isinstance(s, str):
        s = str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))
