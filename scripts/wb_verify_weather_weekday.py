"""后端天气星期映射修复验证：mock 网络响应，走真实 _qweather -> _weekday 路径。"""
import sys, json
sys.path.insert(0, r'D:\wwwroot\workbuddy\python-nav')
from unittest.mock import patch
import app.workbench_api as wa
from app import create_app

app = create_app()

dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
daily = [{'fxDate': d, 'textDay': '多云', 'tempMax': '30', 'tempMin': '20',
          'iconDay': '101', 'windDirDay': '东风', 'windScaleDay': '3'} for d in dates]
fake_now = json.dumps({'code': '200', 'now': {'temp': '25', 'text': '多云', 'feelsLike': '24',
                    'humidity': '60', 'windDir': '东风', 'windScale': '3', 'vis': '10',
                    'pressure': '1010', 'icon': '101'}})
fake_3d = json.dumps({'code': '200', 'daily': daily[:3]})
fake_7d = json.dumps({'code': '200', 'daily': daily})
fake_24h = json.dumps({'code': '200', 'hourly': []})
fake_astro = json.dumps({'code': '200', 'sunrise': '06:00', 'sunset': '18:00'})


def fake_http_get(url, headers=None):
    if 'weather/now' in url:
        return fake_now
    if 'weather/3d' in url:
        return fake_3d
    if 'weather/7d' in url:
        return fake_7d
    if 'weather/24h' in url:
        return fake_24h
    if 'sunrise-sunset' in url:
        return fake_astro
    return '{}'


with app.test_request_context('/api/weather?city=上海', headers={'X-QWeather-Key': 'fake'}):
    with patch.object(wa, '_http_get', fake_http_get), \
         patch.object(wa, '_resolve_location', return_value='101020100'):
        data = wa._qweather()

fc = [f['day'] for f in data['forecast']]
d7 = [d['day'] for d in data['daily7']]
expected = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
print('forecast(前台):', fc)
print('daily7(详情)  :', d7)
ok = fc == expected[:3] and d7 == expected
print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
