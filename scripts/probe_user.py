"""
probe_user.py —— 验证用探针用户的创建 / 删除（隔离测试，测完即删）。

用法：
    python probe_user.py create   # 创建 wb_probe_sys / probe1234（含默认 UserSettings）
    python probe_user.py delete   # 删除该用户及其设置

注意：用系统 python（含 flask）：D:/App/FlyEnv-Data/env/python/python.exe
"""
import os
import sys

# 确保项目根目录在 sys.path（脚本位于 scripts/，需能 import run / app）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run import app
from app.models import db, User, UserSettings

USERNAME = sys.argv[2] if len(sys.argv) > 2 else 'wb_probe_sys'
PASSWORD = 'probe1234'


def create():
    with app.app_context():
        u = User.query.filter_by(username=USERNAME).first()
        if u is None:
            u = User(username=USERNAME, nickname=USERNAME)
            u.set_password(PASSWORD)
            db.session.add(u)
            db.session.flush()
        # 确保有设置行（缺省值由模型默认提供）；验证统一进入工作台视图
        us = UserSettings.query.filter_by(user_id=u.id).first()
        if us is None:
            us = UserSettings(user_id=u.id, default_view='workbench')
            db.session.add(us)
        else:
            us.default_view = 'workbench'
        db.session.commit()
        print(f'OK created/ensured probe user {USERNAME}')


def delete():
    with app.app_context():
        u = User.query.filter_by(username=USERNAME).first()
        if u is not None:
            UserSettings.query.filter_by(user_id=u.id).delete()
            db.session.delete(u)
            db.session.commit()
            print(f'OK deleted probe user {USERNAME}')
        else:
            print(f'(skip) probe user {USERNAME} not found')


if __name__ == '__main__':
    action = (sys.argv[1] if len(sys.argv) > 1 else 'create').lower()
    if action == 'create':
        create()
    elif action == 'delete':
        delete()
    else:
        print('usage: probe_user.py [create|delete]')
        sys.exit(1)
