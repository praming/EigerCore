"""
init_db.py —— 数据库初始化 / 迁移脚本
======================================
首次运行项目前，执行本脚本创建数据表（user、link、group、user_settings）。
之后反复运行也安全：
  - 若表不存在：db.create_all() 创建；
  - 若表已存在但缺新列（如老库的 user 缺 nickname/avatar、link 缺 group_id）：
    通过 ALTER TABLE 补齐，避免丢失已有数据。

运行方式（在项目根目录 python-nav/ 下执行）：
    python init_db.py
"""

import re

from sqlalchemy import inspect, text

from run import app
from app.models import db, User, Link, Group, UserSettings, CustomTheme, SiteSettings, BiddingItem, WorkbenchState


def init_db():
    with app.app_context():   # 必须在应用上下文里操作数据库
        # 1) 创建所有尚不存在的表（已存在的表不会被改动）
        db.create_all()

        inspector = inspect(db.engine)

        # 2) 为已有的 user 表补齐新列（nickname / avatar / is_admin）
        user_cols = {c['name'] for c in inspector.get_columns('user')}
        with db.engine.begin() as conn:
            if 'nickname' not in user_cols:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN nickname VARCHAR(80)'))
            if 'avatar' not in user_cols:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN avatar VARCHAR(255)'))
            if 'is_admin' not in user_cols:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'))

        # 3) 为已有的 link 表补齐 group_id / note / icon_url 列
        #    （SQLite 不支持 ADD COLUMN ... REFERENCES，这里加为普通类型，应用层关系仍正常）
        link_cols = {c['name'] for c in inspector.get_columns('link')}
        with db.engine.begin() as conn:
            if 'group_id' not in link_cols:
                conn.execute(text('ALTER TABLE "link" ADD COLUMN group_id INTEGER'))
            if 'note' not in link_cols:
                conn.execute(text('ALTER TABLE "link" ADD COLUMN note VARCHAR(200)'))
            if 'icon_url' not in link_cols:
                conn.execute(text('ALTER TABLE "link" ADD COLUMN icon_url VARCHAR(255)'))

        # 3.5) 站点品牌从 user_settings 迁出前，**先**给 site_settings 补齐 4 列（site_name 等），
        #      并确保 id=1 单例行存在 —— 否则下面 step 4「把 user_settings 抄到 site_settings」
        #      会因目标列不存在而失败。独立事务。
        if 'site_settings' in inspector.get_table_names():
            ss_cols = {c['name'] for c in inspector.get_columns('site_settings')}
            with db.engine.begin() as conn:
                if 'site_name' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN site_name VARCHAR(64) DEFAULT 'Eiger'"))
                    conn.execute(text("UPDATE site_settings SET site_name = 'Eiger' WHERE id = 1 AND (site_name IS NULL OR site_name = '')"))
                if 'site_title' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN site_title VARCHAR(128) DEFAULT ''"))
                if 'site_subtitle' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN site_subtitle VARCHAR(128) DEFAULT ''"))
                if 'site_logo' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN site_logo VARCHAR(512) DEFAULT ''"))
                if 'site_updated_at' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN site_updated_at DATETIME"))
                if 'font_sans' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN font_sans VARCHAR(256) DEFAULT \"Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif\""))
                if 'font_cjk' not in ss_cols:
                    conn.execute(text("ALTER TABLE site_settings ADD COLUMN font_cjk VARCHAR(256) DEFAULT \"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif\""))
            # 确保 id=1 单例行存在（已有则不创建）
            if db.session.get(SiteSettings, 1) is None:
                db.session.add(SiteSettings(id=1, allow_register=True))
                db.session.commit()

        # 4) 为已有的 user_settings 表补齐 open_in_new / default_home / links_per_row_rect 列
        us_cols = {c['name'] for c in inspector.get_columns('user_settings')}
        with db.engine.begin() as conn:
            if 'open_in_new' not in us_cols:
                conn.execute(text('ALTER TABLE "user_settings" ADD COLUMN open_in_new INTEGER'))
            # 补齐默认首页列（default_home）
            if 'default_home' not in us_cols:
                conn.execute(text('ALTER TABLE "user_settings" ADD COLUMN default_home VARCHAR(32)'))
            # 补齐矩形卡片每行数列（links_per_row_rect），存量行默认 12
            if 'links_per_row_rect' not in us_cols:
                conn.execute(text('ALTER TABLE "user_settings" ADD COLUMN links_per_row_rect INTEGER DEFAULT 12'))
                conn.execute(text('UPDATE "user_settings" SET links_per_row_rect = 12 WHERE links_per_row_rect IS NULL'))
            # 补齐「全部链接页」Dock 放大倍数（dock_scale），存量行默认 1.4
            if 'dock_scale' not in us_cols:
                conn.execute(text('ALTER TABLE "user_settings" ADD COLUMN dock_scale REAL DEFAULT 1.4'))
                conn.execute(text('UPDATE "user_settings" SET dock_scale = 1.4 WHERE dock_scale IS NULL'))
            # 补齐默认激活分类（default_category），存量行默认 'nav'
            if 'default_category' not in us_cols:
                conn.execute(text("ALTER TABLE \"user_settings\" ADD COLUMN default_category VARCHAR(16) DEFAULT 'nav'"))
                conn.execute(text("UPDATE \"user_settings\" SET default_category = 'nav' WHERE default_category IS NULL"))
            # 补齐「隐藏的内置主题」列（hidden_builtin_themes），存量行默认空（全部显示）
            if 'hidden_builtin_themes' not in us_cols:
                conn.execute(text("ALTER TABLE \"user_settings\" ADD COLUMN hidden_builtin_themes VARCHAR(255) DEFAULT ''"))
            # 补齐「总站默认进入页面」（default_view），存量行默认 'nav'
            if 'default_view' not in us_cols:
                conn.execute(text("ALTER TABLE \"user_settings\" ADD COLUMN default_view VARCHAR(16) DEFAULT 'nav'"))
                conn.execute(text("UPDATE \"user_settings\" SET default_view = 'nav' WHERE default_view IS NULL"))
            # 补齐「导航分类默认进入的子视图」（default_nav_view），存量行默认 'nav'
            if 'default_nav_view' not in us_cols:
                conn.execute(text("ALTER TABLE \"user_settings\" ADD COLUMN default_nav_view VARCHAR(16) DEFAULT 'nav'"))
                conn.execute(text("UPDATE \"user_settings\" SET default_nav_view = 'nav' WHERE default_nav_view IS NULL"))
            # 站点品牌（系统设置）：站点名称 / 主标题 / 副标题 / logo
            # —— 早期版本曾加在 user_settings 表，每用户一份。本次随「全站统一一套品牌」迁到 site_settings（单例）。
            # 兼容路径：先把 user_settings 任一行的值回填到 SiteSettings 单例（id=1），
            # 然后 DROP COLUMN（SQLite ≥3.35 支持）。
            if 'site_name' in us_cols:
                # 先把 user_settings 上的值抄到 site_settings。
                # 注意：site_settings 列的添加见下方「step 7」之前的预置块（独立事务）。
                row = conn.execute(text(
                    "SELECT site_name, site_title, site_subtitle, site_logo FROM \"user_settings\" "
                    "WHERE site_name IS NOT NULL AND site_name <> 'Eiger' LIMIT 1"
                )).fetchone()
                if row is None:
                    row = conn.execute(text(
                        'SELECT site_name, site_title, site_subtitle, site_logo FROM "user_settings" LIMIT 1'
                    )).fetchone()
                if row is not None:
                    sn, st, ssub, logo = row
                    def _norm(v, lim):
                        v = '' if v is None else str(v)
                        v = v[:lim]
                        return (v or ('Eiger' if lim == 64 else ''))
                    conn.execute(text(
                        "UPDATE site_settings SET site_name = :sn, site_title = :st, site_subtitle = :ssub, site_logo = :logo WHERE id = 1"
                    ), {'sn': _norm(sn, 64), 'st': _norm(st, 128), 'ssub': _norm(ssub, 128), 'logo': _norm(logo, 512)})
                # 立即 DROP COLUMN（同一事务内）
                conn.execute(text('ALTER TABLE "user_settings" DROP COLUMN site_name'))
                conn.execute(text('ALTER TABLE "user_settings" DROP COLUMN site_title'))
                conn.execute(text('ALTER TABLE "user_settings" DROP COLUMN site_subtitle'))
                conn.execute(text('ALTER TABLE "user_settings" DROP COLUMN site_logo'))

        # 5) 为已有的 link 表补齐 bg_color / title_color 列（卡片背景色、标题文字色）
        link_cols = {c['name'] for c in inspector.get_columns('link')}
        with db.engine.begin() as conn:
            if 'bg_color' not in link_cols:
                conn.execute(text('ALTER TABLE "link" ADD COLUMN bg_color VARCHAR(7)'))
            if 'title_color' not in link_cols:
                conn.execute(text('ALTER TABLE "link" ADD COLUMN title_color VARCHAR(7)'))

        # 6) 为已有的 group 表补齐 card_style 列（分组下卡片展示样式：card / link）
        group_cols = {c['name'] for c in inspector.get_columns('group')}
        with db.engine.begin() as conn:
            if 'card_style' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN card_style VARCHAR(8)'))
                # 存量分组默认按 'card' 处理（应用层读取时也会兜底）
                conn.execute(text("UPDATE \"group\" SET card_style = 'card' WHERE card_style IS NULL"))

        # 6.1) 为已有的 group 表补齐「分组级卡片设置」列：每行列数（横排/矩形）、
        #      标题字号、标题最大字符数；存量行填默认值，避免应用层读取到 None
        group_cols = {c['name'] for c in inspector.get_columns('group')}
        with db.engine.begin() as conn:
            if 'links_per_row' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN links_per_row INTEGER DEFAULT 4'))
                conn.execute(text('UPDATE "group" SET links_per_row = 4 WHERE links_per_row IS NULL'))
            if 'links_per_row_rect' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN links_per_row_rect INTEGER DEFAULT 12'))
                conn.execute(text('UPDATE "group" SET links_per_row_rect = 12 WHERE links_per_row_rect IS NULL'))
            if 'title_font_size' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN title_font_size VARCHAR(8)'))
                conn.execute(text("UPDATE \"group\" SET title_font_size = 'base' WHERE title_font_size IS NULL"))
            if 'title_max_len' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN title_max_len INTEGER DEFAULT 0'))
                conn.execute(text('UPDATE "group" SET title_max_len = 0 WHERE title_max_len IS NULL'))

        # 6.2) 为已有的 group 表补齐「标题开关 / 行间距 / 列间距」列
        group_cols = {c['name'] for c in inspector.get_columns('group')}
        with db.engine.begin() as conn:
            if 'show_title' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN show_title INTEGER DEFAULT 1'))
                conn.execute(text('UPDATE "group" SET show_title = 1 WHERE show_title IS NULL'))
            if 'row_gap' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN row_gap INTEGER DEFAULT 16'))
                conn.execute(text('UPDATE "group" SET row_gap = 16 WHERE row_gap IS NULL'))
            if 'col_gap' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN col_gap INTEGER DEFAULT 16'))
                conn.execute(text('UPDATE "group" SET col_gap = 16 WHERE col_gap IS NULL'))
            # 补齐 Dock 放大倍数（dock_scale），存量行默认 1.4
            if 'dock_scale' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN dock_scale REAL DEFAULT 1.4'))
                conn.execute(text('UPDATE "group" SET dock_scale = 1.4 WHERE dock_scale IS NULL'))
            # 补齐「总览视图」专用每行列数（links_per_row_overview / links_per_row_rect_overview），
            # 默认 NULL —— 应用层回退到导航视图对应列数，故无需 UPDATE
            if 'links_per_row_overview' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN links_per_row_overview INTEGER'))
            if 'links_per_row_rect_overview' not in group_cols:
                conn.execute(text('ALTER TABLE "group" ADD COLUMN links_per_row_rect_overview INTEGER'))

        # 6.3) 为已有的 group 表补齐顶层分类列（category），存量分组全部归 'nav'
        group_cols = {c['name'] for c in inspector.get_columns('group')}
        with db.engine.begin() as conn:
            if 'category' not in group_cols:
                conn.execute(text("ALTER TABLE \"group\" ADD COLUMN category VARCHAR(16) NOT NULL DEFAULT 'nav'"))
                conn.execute(text("UPDATE \"group\" SET category = 'nav' WHERE category IS NULL"))

        # 6.3.1) 为已有的 custom_theme 表补齐强调色（accent）列，存量行填默认 amber
        ct_cols = {c['name'] for c in inspector.get_columns('custom_theme')}
        with db.engine.begin() as conn:
            if 'accent' not in ct_cols:
                conn.execute(text("ALTER TABLE custom_theme ADD COLUMN accent VARCHAR(7) DEFAULT '#f59e0b'"))
                conn.execute(text("UPDATE custom_theme SET accent = '#f59e0b' WHERE accent IS NULL"))

        # 6.4) bidding_item 去重键由「link 单列唯一」改为「(link,title) 复合唯一」：
        # 反爬 SPA 源（如 ctbpsp）详情页无 <a href>，所有项 link 兜底为站点基址（相同），
        # 单列唯一会让同页多条公告互相冲突只能存 1 条；改为复合唯一后同页不同公告可并存。
        # 注意：旧 schema 是「内联 UNIQUE (link) 表约束」，其自动索引 sqlite_autoindex_*
        # 无法用 DROP INDEX 删除（SQLite 禁止 drop 内联约束的自动索引），故必须「重建表」：
        # 建新表（含复合唯一索引 uq_bidding_link_title）→ 拷贝数据 → 删旧表 → 改名。
        if 'bidding_item' in inspector.get_table_names():
            # 关键：inspector.get_indexes 不会返回「内联 UNIQUE 约束」的自动索引
            # （sqlite_autoindex_*），必须用建表语句判断旧 schema。
            with db.engine.begin() as _c:
                _row = _c.execute(text(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='bidding_item'"
                )).fetchone()
            _tbl_sql = _row[0] if _row else ''
            has_old_single = bool(re.search(r'UNIQUE\s*\(\s*link\s*\)', _tbl_sql or ''))
            if has_old_single:
                # 重建表：新建无内联唯一的表 → 拷贝数据 → 删旧表 → 改名 → 建复合唯一索引。
                # 顺序上先 DROP 旧表（连带删掉旧表上的 uq_bidding_link_title 与自动索引），
                # 再建复合索引，避免同名索引冲突。
                with db.engine.begin() as conn:
                    conn.execute(text(
                        'CREATE TABLE bidding_item_new ('
                        'id INTEGER NOT NULL PRIMARY KEY, '
                        'source_url VARCHAR(512) NOT NULL, '
                        'source_name VARCHAR(128) NOT NULL, '
                        'title VARCHAR(400) NOT NULL, '
                        'link VARCHAR(512) NOT NULL, '
                        'published_at DATETIME, '
                        'body TEXT, '
                        'body_available BOOLEAN, '
                        'keywords TEXT, '
                        'summary TEXT, '
                        'fetched_at DATETIME NOT NULL)'
                    ))
                    # 旧表单列 link 唯一 ⇒ (link,title) 必然不重复，直接整表拷贝
                    conn.execute(text(
                        'INSERT INTO bidding_item_new '
                        '(id, source_url, source_name, title, link, published_at, body, body_available, keywords, fetched_at) '
                        'SELECT id, source_url, source_name, title, link, published_at, body, body_available, keywords, fetched_at '
                        'FROM bidding_item'
                    ))
                    conn.execute(text('DROP TABLE bidding_item'))
                    conn.execute(text('ALTER TABLE bidding_item_new RENAME TO bidding_item'))
                    conn.execute(text(
                        'CREATE UNIQUE INDEX uq_bidding_link_title ON bidding_item (link, title)'
                    ))
            else:
                # 已无旧单列唯一：确保复合唯一索引存在（兼容更早版本）
                with db.engine.begin() as conn:
                    conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_bidding_link_title ON bidding_item (link, title)'))

        # 6.5) bidding_item 补齐 summary 列（列表/搜索结果页摘要或元数据片段，
        #      如 ctbpsp 的「省·类型·接收时间」；浏览器源无正文时替代 body 展示）。
        #      该列在原 (link) 单列唯一 schema 重建时未包含，故此处统一 ALTER 补齐。
        if 'bidding_item' in inspector.get_table_names():
            bi_cols = {c['name'] for c in inspector.get_columns('bidding_item')}
            if 'summary' not in bi_cols:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE "bidding_item" ADD COLUMN summary TEXT DEFAULT \'\''))

        # 6) 为存量用户（老数据）补一份默认设置，避免出现 settings 为空的情况
        for u in User.query.all():
            if UserSettings.query.filter_by(user_id=u.id).first() is None:
                db.session.add(UserSettings(user_id=u.id))

        # 6.6) 管理员初始化：把 praming(id=1) 设为唯一管理员。
        #      规则：① 名为 praming 的账号无条件置为管理员；② 清掉其他所有账号的
        #      管理员标志，确保全局仅有 1 个管理员（符合「管理员仅允许一个用户」）。
        #      发布后新库不依赖此步——register() 会按「首个注册用户自动成为管理员」处理。
        praming = User.query.filter_by(username='praming').first()
        if praming is None:
            praming = db.session.get(User, 1)
        if praming is not None:
            for u in User.query.all():
                u.is_admin = bool(u.id == praming.id)
            db.session.flush()

        # 7) 站点级单例设置（id=1）：行已在 step 3.5 预置（site_settings 列也已补齐），此处仅兜底。
        existing = db.session.get(SiteSettings, 1)
        if existing is None:
            db.session.add(SiteSettings(id=1, allow_register=True))

        db.session.commit()

        print('✅ 数据库初始化 / 迁移完成：instance/links.db')


if __name__ == '__main__':
    init_db()
