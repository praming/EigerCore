"""
verify_mutation_contract.py —— 拖拽排序 / 批量操作 接口契约测试
============================================================
覆盖 #123 新增 / 复用的三个写接口（均走 JSON，复用 Flask-WTF 校验 + CSRF）：
  - POST /update-order          {order:[link_ids]}            链接（分组内）拖拽重排
  - POST /group/update-order    {order:[group_ids]}          侧栏分组拖拽重排
  - POST /batch                 {action,mids?,group_id?}     批量删除 / 移动

校验点：
  1) 正常路径返回 {status:'ok'}，且 DB 中 sort_order / group_id 真实落库；
  2) 缺 CSRF 令牌的 POST 被拒（400）；
  3) order 类型非法（非 list）被拒（400）；
  4) 越权防护：只更新属于自己的行（他人 id 被忽略）；
  5) 批量移动到「未分组」(group_id=0) 把 group_id 置 NULL。

与 verify_write_contract.py 同套脚手架：独立临时 SQLite + 一次性测试用户。
用法：python scripts/verify_mutation_contract.py
退出码 0 = 全部通过。
"""

import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db  # noqa: E402
import app.models  # noqa: F401
from app.models import User, Link, Group  # noqa: E402
from app.config import Config as _BaseConfig  # noqa: E402

failures = []
checks = 0


def expect(cond, msg):
    global checks
    checks += 1
    if not cond:
        failures.append(msg)


def main():
    tmp = tempfile.mkdtemp(prefix='spa_mutation_contract_')
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
            u = User(username='mutation_test', nickname='M')
            u.set_password('x')
            db.session.add(u)
            u2 = User(username='other_user', nickname='O')
            u2.set_password('x')
            db.session.add(u2)
            db.session.commit()
            uid, uid2 = u.id, u2.id

            # 准备 3 个分组 + 各 2 条链接
            gs = []
            for i, name in enumerate(['A 组', 'B 组', 'C 组']):
                g = Group(user_id=uid, category='nav', name=name, sort_order=i + 1,
                          card_style='card', title_font_size='base', show_title=True,
                          row_gap=16, col_gap=16, dock_scale=1.4)
                db.session.add(g)
                gs.append(g)
            db.session.commit()
            gids = [g.id for g in gs]
            # 往 A、B 组各放 2 条链接（sort_order 1,2 / 1,2）
            links_a = []
            for i, t in enumerate(['A1', 'A2']):
                l = Link(user_id=uid, group_id=gs[0].id, title=t,
                         url='https://a%d.example.com' % i, icon='link', sort_order=i + 1)
                db.session.add(l)
                links_a.append(l)
            links_b = []
            for i, t in enumerate(['B1', 'B2']):
                l = Link(user_id=uid, group_id=gs[1].id, title=t,
                         url='https://b%d.example.com' % i, icon='link', sort_order=i + 1)
                db.session.add(l)
                links_b.append(l)
            # 一条属于「他人」的链接（越权测试用）
            other = Link(user_id=uid2, group_id=None, title='others',
                         url='https://other.example.com', icon='link', sort_order=1)
            db.session.add(other)
            db.session.commit()
            aid = [l.id for l in links_a]
            bid = [l.id for l in links_b]
            oid = other.id

        client = app.test_client()
        with client.session_transaction() as sess:
            sess['_user_id'] = str(uid)
            sess['_fresh'] = True

        tok = client.get('/api/csrf-token').get_json()['token']
        H = {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': tok,
            'Content-Type': 'application/json',
        }

        def json_post(url, payload, headers=None):
            return client.post(url, json=payload, headers=headers or H)

        def so(link_id):
            with app.app_context():
                return db.session.get(Link, link_id).sort_order

        def sgo(gid):
            with app.app_context():
                return db.session.get(Group, gid).sort_order

        print('== 拖拽排序 / 批量操作 接口契约测试 ==\n')

        # ---- 1) /update-order：分组内链接重排 ----
        # A 组原本 [A1(1), A2(2)] → 反转为 [A2, A1]
        r = json_post('/update-order', {'order': [aid[1], aid[0]]})
        expect(r.status_code == 200, f'/update-order: HTTP {r.status_code}（期望 200）')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/update-order: status != ok')
        expect(so(aid[1]) == 1 and so(aid[0]) == 2,
               '/update-order: A 组链接 sort_order 未按新顺序落库')
        # 其它分组不应被改动
        expect(so(bid[0]) == 1 and so(bid[1]) == 2,
               '/update-order: 意外改动了 B 组链接顺序')

        # ---- 2) /update-order：order 非 list → 400 ----
        r = json_post('/update-order', {'order': 'not-a-list'})
        expect(r.status_code == 400, f'/update-order(非法 order): 应 400，实际 {r.status_code}')

        # ---- 3) /group/update-order：分组重排 ----
        # [A,B,C] → [C,A,B]
        r = json_post('/group/update-order', {'order': [gids[2], gids[0], gids[1]]})
        expect(r.status_code == 200, f'/group/update-order: HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/group/update-order: status != ok')
        expect(sgo(gids[2]) == 1 and sgo(gids[0]) == 2 and sgo(gids[1]) == 3,
               '/group/update-order: 分组 sort_order 未按新顺序落库')

        # ---- 4) 越权防护：order 混入他人链接 id 应被忽略 ----
        # 路由按「提交列表下标 + 1」赋值 sort_order，越权项被跳过但不占序；
        # 因此本组两项分别落在 1 与 3（下标 0 与 2）。
        r = json_post('/update-order', {'order': [aid[0], oid, aid[1]]})
        expect(r.status_code == 200, '/update-order(含越权id): 仍应 200（忽略越权项）')
        # 他人那条 order 不变（仍为 1），且不应抛错
        with app.app_context():
            expect(db.session.get(Link, oid).user_id == uid2,
                   '/update-order: 越权 id 不应被篡改为当前用户')
        # 本组顺序：aid[0]=1（下标 0），aid[1]=3（下标 2，越权项被跳过但不占序）
        expect(so(aid[0]) == 1 and so(aid[1]) == 3,
               '/update-order(含越权id): 剩余本组链接顺序应正确')

        # ---- 5) /batch move：把 A 组两条链接移动到 B 组 ----
        r = json_post('/batch', {'action': 'move', 'ids': aid, 'group_id': gids[1]})
        expect(r.status_code == 200, f'/batch(move): HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/batch(move): status != ok')
        with app.app_context():
            for lid in aid:
                expect(db.session.get(Link, lid).group_id == gids[1],
                       f'/batch(move): 链接 {lid} 的 group_id 未更新为目标分组')

        # ---- 6) /batch move 到未分组（group_id=0 → NULL） ----
        r = json_post('/batch', {'action': 'move', 'ids': aid, 'group_id': 0})
        expect(r.status_code == 200, '/batch(move→未分组): HTTP 非 200')
        with app.app_context():
            for lid in aid:
                expect(db.session.get(Link, lid).group_id is None,
                       f'/batch(move→未分组): 链接 {lid} 的 group_id 应置 NULL')

        # ---- 7) /batch delete：删除 B 组原本的两条链接 ----
        r = json_post('/batch', {'action': 'delete', 'ids': bid})
        expect(r.status_code == 200, f'/batch(delete): HTTP {r.status_code}')
        d = r.get_json() or {}
        expect(d.get('status') == 'ok', '/batch(delete): status != ok')
        with app.app_context():
            for lid in bid:
                expect(db.session.get(Link, lid) is None,
                       f'/batch(delete): 链接 {lid} 应已被删除')

        # ---- 8) /batch 未知 action → 400 ----
        r = json_post('/batch', {'action': 'frobnicate', 'ids': aid})
        expect(r.status_code == 400, f'/batch(未知 action): 应 400，实际 {r.status_code}')

        # ---- 9) CSRF 防护：缺令牌的 POST 被拒 ----
        r = client.post('/update-order', json={'order': aid},
                        headers={'X-Requested-With': 'XMLHttpRequest',
                                 'Content-Type': 'application/json'})
        expect(r.status_code == 400, f'/update-order(无 CSRF): 应 400，实际 {r.status_code}')

        # 汇总
        print(f'\n== 共 {checks} 项断言 ==')
        if failures:
            print(f'!! 失败 {len(failures)} 项：')
            for f in failures:
                print(f'   - {f}')
            rc = 1
        else:
            print('✓ 全部通过：拖拽排序 / 批量操作 接口契约与 DB 落库一致')
            rc = 0

        with app.app_context():
            Link.query.filter_by(user_id=uid).delete()
            Link.query.filter_by(user_id=uid2).delete()
            Group.query.filter_by(user_id=uid).delete()
            u = db.session.get(User, uid)
            if u:
                db.session.delete(u)
            u2 = db.session.get(User, uid2)
            if u2:
                db.session.delete(u2)
            db.session.commit()
        return rc
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
