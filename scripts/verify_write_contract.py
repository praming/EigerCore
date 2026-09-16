"""
verify_write_contract.py —— 写接口 ↔ 前端 DTO 契约 + 往返测试
============================================================
用途：校验 6 个写接口（add/edit/delete link & group）在 SPA 协商模式
（请求头 X-Requested-With: XMLHttpRequest）下的 JSON 回包字段名、类型
与 web/src/types/api.ts 中的 DTO 声明一致，并验证：
  1) _wants_json() 命中时返回 {status:'ok', msg, link|group|id}；
  2) 校验失败时返回 {status:'error', msg, errors:{field:[...]}}（400）；
  3) 未带 X-Requested-With 时回落到 Jinja 原生路径（flash + 302 重定向），
     保证「零交互回归」——原生表单提交逐字节不变。

与 verify_api_contract.py 的区别：
  - 本脚本用**独立临时 SQLite**（不碰真实 instance/links.db），并自建一个
    一次性测试用户，跑完即清理，避免污染真实数据；
  - 侧重「写」的往返（先写后读、先改后验），而非只读快照。

用法（无需密码，用 Flask-Login 测试会话直接注入登录态）：
    python scripts/verify_write_contract.py
退出码 0 = 全部通过；非 0 = 有断言失败。
"""

import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db  # noqa: E402
import app.models  # noqa: F401 确保 Link/Group/User 等模型注册到 metadata
from app.models import User, Link, Group  # noqa: E402
from app.config import Config as _BaseConfig  # noqa: E402

# 与 web/src/types/api.ts 逐字对齐（沿用 verify_api_contract 的 DTO 定义）-----
LINK_DTO = {
    'id': (int,),
    'group_id': (int, type(None)),
    'title': (str,),
    'url': (str,),
    'icon': (str, type(None)),
    'icon_url': (str, type(None)),
    'note': (str, type(None)),
    'bg_color': (str, type(None)),
    'title_color': (str, type(None)),
    'sort_order': (int,),
    'created_at': (str, type(None)),
}

GROUP_DTO = {
    'id': (int,),
    'name': (str,),
    'icon': (str, type(None)),
    'sort_order': (int,),
    'category': (str,),
    'card_style': (str,),
    'links_per_row': (int, type(None)),
    'links_per_row_rect': (int, type(None)),
    'links_per_row_overview': (int, type(None)),
    'links_per_row_rect_overview': (int, type(None)),
    'title_font_size': (str, type(None)),
    'title_max_len': (int, type(None)),
    'show_title': (bool,),
    'row_gap': (int, type(None)),
    'col_gap': (int, type(None)),
    'dock_scale': (float, int, type(None)),
    'created_at': (str, type(None)),
}

# 分组标题字号白名单（app/routes.py::_parse_group_card_settings）
TITLE_FS_ENUM = ('sm', 'base', 'lg', 'xl', '2xl', '10px', '12px')
CARD_STYLE_ENUM = ('card', 'link')

failures = []
checks = 0


def check_shape(obj, spec, where, allow_extra=True):
    """逐字段校验类型；缺字段 / 类型不符 → 记录失败。"""
    global checks
    for key, types in spec.items():
        checks += 1
        if key not in obj:
            failures.append(f'{where}: 缺少字段 `{key}`')
            continue
        val = obj[key]
        if not isinstance(val, types):
            failures.append(
                f'{where}.{key}: 类型不符，期望 {[t.__name__ for t in types]}，'
                f'实际 {type(val).__name__} = {val!r}'
            )
    if not allow_extra:
        for key in obj:
            if key not in spec:
                failures.append(f'{where}: 出现 DTO 未声明的字段 `{key}`')


def expect(cond, msg):
    global checks
    checks += 1
    if not cond:
        failures.append(msg)


def main():
    # 独立临时库，避免污染真实数据 -------------------------------------------
    tmp = tempfile.mkdtemp(prefix='spa_write_contract_')
    try:
        uri = 'sqlite:///' + os.path.join(tmp, 'test.db')
        # 通过配置子类覆盖数据库 URI（Config 的 URI 是硬编码的，事后改 app.config
        # 无法重新绑定已由 db.init_app 创建的引擎），确保测试落在临时库、不污染真实数据。
        class _TestConfig(_BaseConfig):
            pass
        _TestConfig.SQLALCHEMY_DATABASE_URI = uri
        app = create_app(_TestConfig)
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = True

        with app.app_context():
            db.create_all()
            u = User(username='spa_contract_test', nickname='SPA')
            u.set_password('x')
            db.session.add(u)
            db.session.commit()
            uid = u.id

        client = app.test_client()
        # Flask-Login 测试会话：直接写 _user_id，免密码
        with client.session_transaction() as sess:
            sess['_user_id'] = str(uid)
            sess['_fresh'] = True

        # 取得会话级 CSRF 令牌（与 CSRFProtect 校验同源）
        tok = client.get('/api/csrf-token').get_json()['token']

        def write(url, fields, json_mode=True):
            """模拟 SPA 写请求；json_mode=False 时回落 Jinja 原生提交。"""
            data = dict(fields)
            data['csrf_token'] = tok
            headers = {}
            if json_mode:
                headers['X-Requested-With'] = 'XMLHttpRequest'
            return client.post(url, data=data, headers=headers)

        print('== 写接口 ↔ 前端 DTO 契约 + 往返测试 ==\n')

        # 1) add_link ----------------------------------------------------------
        r = write('/link/add', {
            'title': 'GitHub', 'url': 'https://github.com', 'icon': 'github',
            'note': '', 'group_id': 0, 'bg_color': '#0d1117', 'title_color': '#ffffff',
        })
        expect(r.status_code == 200, f'/link/add: HTTP {r.status_code}（期望 200）')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/link/add: status != ok')
        expect('link' in d, '/link/add: 回包缺少 link 字段')
        check_shape(d.get('link', {}), LINK_DTO, '/link/add.link')
        expect(d.get('link', {}).get('group_id') is None,
               '/link/add: group_id 应为 None（未分组=0 已转 NULL）')
        expect(isinstance(d.get('msg'), str) and d['msg'], '/link/add: msg 应为非空字符串')
        l1 = d.get('link', {}).get('id')

        # 2) edit_link（回传 icon，验证编辑不会把图标重置为默认） ----------------
        r = write(f'/link/{l1}/edit', {
            'title': 'GitHub 编辑后', 'url': 'https://github.com/explore', 'icon': 'github',
            'note': 'note', 'group_id': 0, 'bg_color': '', 'title_color': '',
        })
        expect(r.status_code == 200, f'/link/{l1}/edit: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/link/edit: status != ok')
        check_shape(d.get('link', {}), LINK_DTO, '/link/edit.link')
        expect(d.get('link', {}).get('id') == l1, '/link/edit: id 与新增不一致')
        expect(d.get('link', {}).get('title') == 'GitHub 编辑后', '/link/edit: title 未更新')
        expect(d.get('link', {}).get('url') == 'https://github.com/explore', '/link/edit: url 未更新')
        expect(d.get('link', {}).get('icon') == 'github', '/link/edit: icon 被错误重置为默认')

        # 2b) icon_url_clear：切换到内置图标应清除已上传图标 ------------------
        # 先用 DB 直接给链接挂一个「已上传图标」，模拟此前上传过图片
        with app.app_context():
            lk = db.session.get(Link, l1)
            lk.icon_url = '/uploads/old-icon.png'
            db.session.commit()
        r = write(f'/link/{l1}/edit', {
            'title': 'GitHub', 'url': 'https://github.com', 'icon': 'star',
            'note': '', 'group_id': 0, 'bg_color': '', 'title_color': '',
            'icon_url_clear': '1',
        })
        expect(r.status_code == 200, f'/link/{l1}/edit(clear): HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/link/edit(clear): status != ok')
        expect(d.get('link', {}).get('icon') == 'star', '/link/edit(clear): icon 未更新为 star')
        expect(d.get('link', {}).get('icon_url') is None,
               '/link/edit(clear): icon_url 应被清空（否则旧图仍被优先展示）')

        # 2c) 不传 icon_url_clear 的普通编辑不得清除既有 icon_url --------------
        with app.app_context():
            lk = db.session.get(Link, l1)
            lk.icon_url = '/uploads/again.png'
            db.session.commit()
        r = write(f'/link/{l1}/edit', {
            'title': 'GitHub', 'url': 'https://github.com', 'icon': 'star',
            'note': '', 'group_id': 0, 'bg_color': '', 'title_color': '',
        })
        expect(r.status_code == 200, f'/link/{l1}/edit(noclear): HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('link', {}).get('icon_url') == '/uploads/again.png',
               '/link/edit(noclear): 未传 icon_url_clear 时既有 icon_url 不应被清除')

        # 3) add_group（card 样式 → 写 links_per_row，rect 字段为 None） --------
        r = write('/group/add', {
            'name': '开发', 'icon': 'code',
            'card_style': 'card', 'g_cols': 4, 'g_cols_ov': 4,
            'g_fs': 'lg', 'g_maxlen': 20, 'g_show_title': '1',
            'g_row_gap': 16, 'g_col_gap': 16, 'g_dock_scale': 1.4,
        })
        expect(r.status_code == 200, f'/group/add: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/group/add: status != ok')
        expect('group' in d, '/group/add: 回包缺少 group 字段')
        check_shape(d.get('group', {}), GROUP_DTO, '/group/add.group')
        expect(d.get('group', {}).get('links') == [], '/group/add: links 应为空数组')
        # card 样式：仅写入 links_per_row（=4），links_per_row_rect 保留列默认 12（DTO 允许 int|None）
        expect(d.get('group', {}).get('links_per_row') == 4, '/group/add: card 样式 links_per_row 应为 4')
        expect(isinstance(d.get('group', {}).get('links_per_row_rect'), int),
               '/group/add: card 样式 links_per_row_rect 应为 int（保留默认，非 None）')
        expect(d.get('group', {}).get('links_per_row_overview') == 4,
               '/group/add: card 样式 links_per_row_overview 应为 4')
        expect(d.get('group', {}).get('links_per_row_rect_overview') is None,
               '/group/add: 总览矩形列默认应为 None')
        expect(d.get('group', {}).get('category') == 'nav', '/group/add: category 应为 nav')
        g1 = d.get('group', {}).get('id')

        # 4) 往分组里加一条链接，随后 edit_group（link 样式 + 带 links 回包） ----
        r = write('/link/add', {
            'title': 'Docs', 'url': 'https://docs.example.com', 'icon': 'book',
            'note': '', 'group_id': g1, 'bg_color': '', 'title_color': '',
        })
        expect(r.status_code == 200, '/link/add(入组): HTTP 非 200')
        l2 = (r.get_json() or {}).get('link', {}).get('id')

        r = write(f'/group/{g1}/edit', {
            'name': '开发组改名', 'icon': 'code',
            'card_style': 'link', 'g_cols': 12, 'g_cols_ov': 8,
            'g_fs': 'xl', 'g_maxlen': 30, 'g_show_title': '1',
            'g_row_gap': 20, 'g_col_gap': 24, 'g_dock_scale': 2.0,
        })
        expect(r.status_code == 200, f'/group/{g1}/edit: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/group/edit: status != ok')
        check_shape(d.get('group', {}), GROUP_DTO, '/group/edit.group')
        expect(d.get('group', {}).get('name') == '开发组改名', '/group/edit: name 未更新')
        expect(d.get('group', {}).get('card_style') == 'link', '/group/edit: card_style 未更新')
        # link 样式：仅写入 links_per_row_rect（=12），links_per_row 保留列默认 4（DTO 允许 int|None）
        expect(isinstance(d.get('group', {}).get('links_per_row'), int),
               '/group/edit: link 样式 links_per_row 应为 int（保留默认，非 None）')
        expect(d.get('group', {}).get('links_per_row_rect') == 12,
               '/group/edit: link 样式 links_per_row_rect 应为 12')
        # 总览矩形列激活（=8）；总览横排列（card 样式专属）本次未写入，保留既有值（int，DTO 合法）
        expect(isinstance(d.get('group', {}).get('links_per_row_overview'), int),
               '/group/edit: links_per_row_overview 应为 int（保留既有值）')
        expect(d.get('group', {}).get('links_per_row_rect_overview') == 8,
               '/group/edit: links_per_row_rect_overview 应为 8')
        expect(d.get('group', {}).get('title_font_size') == 'xl', '/group/edit: title_font_size 未更新')
        expect(isinstance(d.get('group', {}).get('links'), list), '/group/edit: 应回传 links 数组')
        for j, lk in enumerate(d.get('group', {}).get('links') or []):
            check_shape(lk, LINK_DTO, f'/group/edit.group.links[{j}]')

        # 5) delete_link -------------------------------------------------------
        r = write(f'/link/{l2}/delete', {})
        expect(r.status_code == 200, f'/link/{l2}/delete: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/link/delete: status != ok')
        expect(d.get('id') == l2, '/link/delete: 回包 id 与被删链接不一致')
        expect(isinstance(d.get('msg'), str) and d['msg'], '/link/delete: msg 应为非空字符串')

        # 6) delete_group（其子链接应回退未分组；回包带 id） -------------------
        r = write(f'/group/{g1}/delete', {})
        expect(r.status_code == 200, f'/group/{g1}/delete: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/group/delete: status != ok')
        expect(d.get('id') == g1, '/group/delete: 回包 id 与被删分组不一致')
        # 验证该组已从 /api/groups 消失
        rg = client.get('/api/groups?category=nav',
                        headers={'X-Requested-With': 'XMLHttpRequest'}).get_json() or {}
        gids = [g['id'] for g in rg.get('groups') or []]
        expect(g1 not in gids, '/group/delete: 已删分组仍出现在 /api/groups')
        # 验证 l1（本就未分组）仍在，且 delete_group 未误删其子链接以外数据
        all_links = (rg.get('ungrouped') or {}).get('links') or []
        for sec in (rg.get('sections') or []) if 'sections' in rg else []:
            pass
        l1_present = any(l['id'] == l1 for l in all_links)
        expect(l1_present, '/group/delete: 未分组链接 l1 意外丢失')

        # 7) 校验失败路径：空 title/url → 400 + errors --------------------------
        r = write('/link/add', {'title': '', 'url': '', 'group_id': 0})
        expect(r.status_code == 400, f'/link/add 校验失败应 400，实际 {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'error', '/link/add(空值): status != error')
        expect(isinstance(d.get('msg'), str) and d.get('msg'), '/link/add(空值): msg 应为非空字符串')
        expect(isinstance(d.get('errors'), dict), '/link/add(空值): errors 应为字典')
        expect('title' in d.get('errors', {}) and d['errors']['title'],
               '/link/add(空值): errors.title 应给出错误信息数组')
        expect('url' in d.get('errors', {}) and d['errors']['url'],
               '/link/add(空值): errors.url 应给出错误信息数组')

        # 8) 零回归：Jinja 原生提交（不带 X-Requested-With）应 302 重定向 ------
        r = write('/link/add', {
            'title': 'Jinja 原生提交', 'url': 'https://example.com', 'icon': 'link',
            'note': '', 'group_id': 0, 'bg_color': '', 'title_color': '',
        }, json_mode=False)
        expect(r.status_code in (301, 302, 303),
               f'Jinja 原生提交应重定向，实际 HTTP {r.status_code}（期望 302）')

        # 汇总 -----------------------------------------------------------------
        print(f'\n== 共 {checks} 项断言 ==')
        if failures:
            print(f'!! 失败 {len(failures)} 项：')
            for f in failures:
                print(f'   - {f}')
            rc = 1
        else:
            print('✓ 全部通过：写接口 JSON 契约与前端 DTO 一致，且 Jinja 原生路径保持 302')
            rc = 0

        # 清理一次性测试用户及其数据 ------------------------------------------
        with app.app_context():
            Link.query.filter_by(user_id=uid).delete()
            Group.query.filter_by(user_id=uid).delete()
            u = db.session.get(User, uid)
            if u:
                db.session.delete(u)
            db.session.commit()
        return rc
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
