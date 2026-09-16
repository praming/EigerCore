"""
verify_api_contract.py —— 读接口 ↔ 前端 DTO 契约测试
====================================================
用途：校验 /api/* 读接口返回的字段名、类型与 web/src/types/api.ts 中的 DTO 声明一致。

为什么需要它：
  前端是 TypeScript，DTO 一旦与后端序列化漂移（例如把 String 字段声明成 number），
  vue-tsc 只会在「消费处」报错，且很容易被 `|| 默认值` 掩盖成运行期 bug。
  本脚本把契约固定成断言，后端改字段时立刻暴露。

用法（无需密码，用 Flask-Login 的测试会话直接注入登录态）：
    python scripts/verify_api_contract.py
退出码 0 = 全部通过；非 0 = 有断言失败。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.models import User  # noqa: E402

# 与 web/src/types/api.ts 逐字对齐 --------------------------------------------

# type 用 tuple 表示「允许的 Python 类型」，None 单独用 nullable 标记
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
    'title_font_size': (str, type(None)),   # ← Group.title_font_size 是 String(8)
    'title_max_len': (int, type(None)),
    'show_title': (bool,),
    'row_gap': (int, type(None)),
    'col_gap': (int, type(None)),
    'dock_scale': (float, int, type(None)),
    'created_at': (str, type(None)),
}

OVERVIEW_SECTION_DTO = {
    'id': (int,),
    'name': (str,),
    'icon': (str, type(None)),
    'is_rect': (bool,),
    'cols': (int,),
    'title_fs': (str,),                     # ← 由 title_font_size or 'base' 得来，恒为 str
    'maxlen': (int, type(None)),
    'show_title': (bool,),
    'dock_scale': (float, int, type(None)),
    'row_gap': (int, type(None)),
    'col_gap': (int, type(None)),
}

CATEGORY_DTO = {
    'id': (str,),
    'name': (str,),
    'icon': (str,),
    'order': (int,),
    'enabled': (bool,),
}

SETTINGS_DTO = {
    'theme': (str,),
    'links_per_row': (int, type(None)),
    'links_per_row_rect': (int, type(None)),
    'session_days': (int,),
    'open_in_new': (bool,),
    'default_home': (str, type(None)),
    'dock_scale': (float, int),
    'default_category': (str,),
}

# 分组标题字号白名单（app/routes.py::_parse_group_card_settings）
TITLE_FS_ENUM = ('sm', 'base', 'lg', 'xl', '2xl', '10px', '12px')

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
    app = create_app()
    with app.app_context():
        user = User.query.filter_by(username='praming').first() or User.query.first()
        if not user:
            print('!! 数据库中没有任何用户，无法验证登录态接口')
            return 2
        uid = user.id
        uname = user.username

    client = app.test_client()
    # Flask-Login 测试会话：直接写 _user_id，免密码
    with client.session_transaction() as sess:
        sess['_user_id'] = str(uid)
        sess['_fresh'] = True

    print(f'== 以用户 {uname}(id={uid}) 验证读接口契约 ==\n')

    # 1) /api/categories -----------------------------------------------------
    r = client.get('/api/categories')
    expect(r.status_code == 200, f'/api/categories: HTTP {r.status_code}')
    d = r.get_json()
    expect(d.get('status') == 'ok', '/api/categories: status != ok')
    expect(isinstance(d.get('current'), str), '/api/categories: current 非 str')
    for i, item in enumerate(d.get('items') or []):
        check_shape(item, CATEGORY_DTO, f'/api/categories.items[{i}]')
    print(f'  /api/categories            items={len(d.get("items") or [])} current={d.get("current")!r}')

    # 2) /api/groups ---------------------------------------------------------
    r = client.get('/api/groups?category=nav')
    expect(r.status_code == 200, f'/api/groups: HTTP {r.status_code}')
    d = r.get_json()
    expect(d.get('status') == 'ok', '/api/groups: status != ok')
    groups = d.get('groups') or []
    link_total = 0
    for i, g in enumerate(groups):
        check_shape(g, GROUP_DTO, f'/api/groups.groups[{i}]')
        expect(
            g.get('card_style') in ('card', 'link'),
            f'/api/groups.groups[{i}].card_style: 非 card|link → {g.get("card_style")!r}',
        )
        if g.get('title_font_size') is not None:
            expect(
                g['title_font_size'] in TITLE_FS_ENUM,
                f'/api/groups.groups[{i}].title_font_size: 不在白名单 → {g["title_font_size"]!r}',
            )
        expect('links' in g, f'/api/groups.groups[{i}]: 缺少嵌套 links')
        for j, l in enumerate(g.get('links') or []):
            check_shape(l, LINK_DTO, f'/api/groups.groups[{i}].links[{j}]')
        link_total += len(g.get('links') or [])

    ung = d.get('ungrouped') or {}
    check_shape(ung, {'id': (int,), 'name': (str,), 'count': (int,)}, '/api/groups.ungrouped')
    expect(ung.get('id') == 0, '/api/groups.ungrouped.id 应恒为 0')
    expect(
        ung.get('count') == len(ung.get('links') or []),
        '/api/groups.ungrouped: count 与 links 长度不一致',
    )
    for j, l in enumerate(ung.get('links') or []):
        check_shape(l, LINK_DTO, f'/api/groups.ungrouped.links[{j}]')
    print(f'  /api/groups                groups={len(groups)} links={link_total} ungrouped={ung.get("count")}')

    # 3) /api/overview-sections ---------------------------------------------
    r = client.get('/api/overview-sections')
    expect(r.status_code == 200, f'/api/overview-sections: HTTP {r.status_code}')
    d = r.get_json()
    expect(d.get('status') == 'ok', '/api/overview-sections: status != ok')
    secs = d.get('sections') or []
    tally = 0
    for i, s in enumerate(secs):
        check_shape(s, OVERVIEW_SECTION_DTO, f'/api/overview-sections.sections[{i}]')
        expect(
            s.get('title_fs') in TITLE_FS_ENUM,
            f'/api/overview-sections.sections[{i}].title_fs: 不在白名单 → {s.get("title_fs")!r}',
        )
        for j, l in enumerate(s.get('links') or []):
            check_shape(l, LINK_DTO, f'/api/overview-sections.sections[{i}].links[{j}]')
        tally += len(s.get('links') or [])
    expect(d.get('total') == tally, f'/api/overview-sections: total({d.get("total")}) != 实际({tally})')
    print(f'  /api/overview-sections     sections={len(secs)} total={d.get("total")}')

    # 4) /api/settings -------------------------------------------------------
    r = client.get('/api/settings')
    expect(r.status_code == 200, f'/api/settings: HTTP {r.status_code}')
    d = r.get_json()
    check_shape({k: v for k, v in d.items() if k != 'status'}, SETTINGS_DTO, '/api/settings')
    print(f'  /api/settings              theme={d.get("theme")!r} open_in_new={d.get("open_in_new")}')

    # 5) /api/auth/me --------------------------------------------------------
    r = client.get('/api/auth/me')
    expect(r.status_code == 200, f'/api/auth/me: HTTP {r.status_code}')
    d = r.get_json()
    check_shape(
        {k: v for k, v in d.items() if k != 'status'},
        {'id': (int,), 'username': (str,), 'nickname': (str, type(None)), 'avatar': (str, type(None))},
        '/api/auth/me',
    )
    print(f'  /api/auth/me               username={d.get("username")!r}')

    # 6) /api/csrf-token -----------------------------------------------------
    r = client.get('/api/csrf-token')
    expect(r.status_code == 200, f'/api/csrf-token: HTTP {r.status_code}')
    d = r.get_json()
    expect(bool(d.get('token')), '/api/csrf-token: token 为空')
    print(f'  /api/csrf-token            token长度={len(d.get("token") or "")}')

    # 7) 未登录时 401（前端 store 依赖此行为把 authed 置 false） ---------------
    anon = app.test_client()
    r = anon.get('/api/groups')
    expect(r.status_code == 401, f'/api/groups 匿名访问应 401，实际 {r.status_code}')
    expect((r.get_json() or {}).get('status') == 'error', '匿名 401 响应体 status 应为 error')
    print('  /api/groups (匿名)          401 + status=error')

    # 汇总 -------------------------------------------------------------------
    print(f'\n== 共 {checks} 项断言 ==')
    if failures:
        print(f'!! 失败 {len(failures)} 项：')
        for f in failures:
            print(f'   - {f}')
        return 1
    print('✓ 全部通过：读接口与前端 DTO 契约一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())
