"""一次性验证：ctbpsp type=browser 源经 Flask test_client 真实抓取 + 归一 + 持久化。

用法（系统 python，含 flask）：
  python scripts/test_bidding_browser.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.config import Config
from app.models import db


class TestConfig(Config):
    _tmp = tempfile.mkstemp(suffix='.db')[1]
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + _tmp


def main():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()

        ctbpsp = {
            'type': 'browser',
            'url': 'https://ctbpsp.com/',
            'name': '中招公共服务平台（ctbpsp）',
            'keywords': [],
            'fetchBody': False,
            'itemSelector': 'div.left_body',
            'titleSelector': 'p.left_body_name',
            'summarySelector': 'span.btncas',
            'dateRegex': '接收时间[:：]\\s*(\\d{4}-\\d{2}-\\d{2})',
            'baseUrl': 'https://ctbpsp.com/',
            'maxItems': 30,
            'stealth': True,
            'channel': 'msedge',
        }
        src_json = json.dumps([ctbpsp], ensure_ascii=False)
        print('>>> 调用 /api/bidding?refresh=1 （仅 ctbpsp browser 源，真实渲染约 40s）...')
        resp = client.get('/api/bidding', query_string={'sources': src_json, 'refresh': '1'})
        print('HTTP', resp.status_code)
        data = resp.get_json()
        print('返回条目数:', len(data) if isinstance(data, list) else data)
        if isinstance(data, list):
            for it in data[:5]:
                print(' -', it.get('publishedAt'), '|', it.get('title'), '|', it.get('url'))
            ctb = [it for it in data if 'ctbpsp' in (it.get('url') or '') or 'ctbpsp' in (it.get('sourceUrl') or '') or '中招' in (it.get('sourceName') or '')]
            print('ctbpsp 命中数:', len(ctb))
        # 清理临时 db
        try:
            os.unlink(TestConfig._tmp)
        except Exception:
            pass


if __name__ == '__main__':
    main()
