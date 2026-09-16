"""
workbench_api.py —— 工作台数据后端 API

提供工作台组件所需的外部数据 + 账户级布局持久化，全部用 Python 标准库实现
（urllib + html.parser），不引入 requests / bs4 等第三方依赖，避免污染系统 Python 环境。

只读数据端点（GET、无需登录、无需 CSRF，失败时兜底占位，前端卡片永远有内容可渲染）：
  GET /api/weather?city=上海        天气（和风天气；缺 QWEATHER_KEY 时返回占位）
  GET /api/sun-history?city=&start=&end=  历史日出日落（Open-Meteo 档案，免密钥；start/end 为 YYYY-MM-DD）
  GET /api/stock?codes=sh600519,... 自选股实时行情（腾讯财经；免密钥）
  GET /api/hotlist?src=weibo&limit=20  实时热搜榜单（apizero 主 + uapis 备；免密钥）
  GET /api/bidding                  招标信息（爬虫抓取 + 关键词匹配；失败兜底占位）
  GET /api/quote[?fresh=1]          每日名言（一言 hitokoto；失败兜底默认句）

账户级持久化端点（登录可见；PUT 受全局 CSRF 保护，前端拦截器自动带 X-CSRF-Token）：
  GET  /api/workbench/state         读取当前用户工作台状态（无记录返回 state=null）
  PUT  /api/workbench/state         保存当前用户工作台状态（body: {state: WbData}）

配置（环境变量，可选）：
  QWEATHER_KEY     和风天气 API Key（免费版 1000 次/天，https://dev.qweather.com）
  QWEATHER_HOST    和风天气接入点，默认 api.qweather.com
  WORKBENCH_BIDDING_SOURCES  JSON 字符串，覆盖默认招标抓取源，格式：
                    [{"url":"https://www.ccgp.gov.cn","keywords":["服务器","采购"],
                      "searchUrl":"https://.../search?q={kw}","fetchBody":true}, ...]
                    字段均可省略；searchUrl 含 {kw} 占位符时按关键词逐个搜索合并命中。
缓存：天气 10min / 行情 15s / 招标 30min / 名言 1h（行情与名言可加 fresh=1 绕过）
"""

import hashlib
import html
import json
import logging
import math
import os
import re
import shutil
import subprocess
import base64
import gzip
import hmac
import tempfile
import time
from datetime import datetime
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from email.utils import parsedate_to_datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_login import current_user
from .models import db, BiddingItem, WorkbenchState

bp = Blueprint('workbench_api', __name__, url_prefix='/api')

# ---------------------------------------------------------------------------
# 缓存（进程内，TTL 秒）
# ---------------------------------------------------------------------------
_CACHE: dict[str, tuple[float, object]] = {}
# 缓存写入时刻（epoch 秒）；用于向客户端返回「真实数据抓取时间」，而非前端请求时刻。
# 命中缓存时该值即上次真实成功抓取的时间；首次/过期回源时刷新为当前时刻。
_CACHE_TS: dict[str, float] = {}
TTL = {'weather': 600, 'stock': 15, 'bidding': 1800, 'quote': 3600, 'sun': 2592000, 'hotlist': 60}

# ---------------------------------------------------------------------------
# 无头浏览器渲染抓取（type=browser）：用于强反爬 SPA 站点（如 ctbpsp.com）
# 由 scripts/browser_fetch.js 经 playwright-core 驱动系统 Edge 完成渲染后抽 DOM。
# 路径可被环境变量覆盖，方便迁移到其它机器；默认指向本机受管 Node + 已装依赖。
# ---------------------------------------------------------------------------
_NODE_PATH = os.environ.get('WORKBENCH_NODE_PATH') or os.path.expanduser('~/.workbuddy/binaries/node/workspace/node_modules')


def _detect_node_bin() -> str:
    """动态探测受管 Node 可执行文件。

    版本目录名会随 Node 升级而变化（如 ``22.22.2`` → ``22.22.2-2``），写死路径会在升级后
    让 browser 抓取源**静默失效**（subprocess 直接失败、返回空结果，前端表现为"刷新无变化"）。
    因此按 current → 版本号倒序 的顺序探测，最后回退到 PATH 里的 node。
    """
    exe = 'node.exe' if os.name == 'nt' else 'node'
    base = os.path.expanduser('~/.workbuddy/binaries/node')
    cands: list[str] = [
        os.path.join(base, 'current', exe),
        os.path.join(base, 'current', 'bin', exe),
    ]
    versions = os.path.join(base, 'versions')
    if os.path.isdir(versions):
        for name in sorted(os.listdir(versions), reverse=True):
            cands.append(os.path.join(versions, name, exe))
            cands.append(os.path.join(versions, name, 'bin', exe))
    for p in cands:
        if os.path.isfile(p):
            return p
    return shutil.which('node') or ''


_NODE_BIN = os.environ.get('WORKBENCH_NODE_BIN') or _detect_node_bin()
_BROWSER_FETCH_JS = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts', 'browser_fetch.js')
)
_BROWSER_TIMEOUT = int(os.environ.get('WORKBENCH_BROWSER_TIMEOUT') or 150)
# 持久化 Edge profile 目录：复用 cookie 可显著降低 ctbpsp 的 WAF/易盾风控命中率
_DEFAULT_EDGE_PROFILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cache', 'edge-profile')
)


def _cached(key: str, ttl: int, producer, force: bool = False):
    now = time.time()
    if not force and key in _CACHE:
        ts, val = _CACHE[key]
        if now - ts < ttl:
            return val
    val = producer()
    # 错误结果（source=='error'）不缓存，避免用户改完 Key/Host 后仍显示陈旧错误
    if not (isinstance(val, dict) and val.get('source') == 'error'):
        _CACHE[key] = (now, val)
        _CACHE_TS[key] = now  # 记录真实抓取时刻（含首次回源与过期回源）
    return val


def _decode_resp(resp, encoding: str = 'utf-8') -> str:
    """读取响应体并解压（QWeather 等对文本响应做 gzip/deflate 压缩）。"""
    data = resp.read()
    cenc = resp.headers.get('Content-Encoding', '')
    if cenc == 'gzip':
        data = gzip.decompress(data)
    elif cenc == 'deflate':
        data = zlib.decompress(data)
    charset = resp.headers.get_content_charset()
    return data.decode(charset or encoding, errors='replace')


def _http_err_body(e: urllib.error.HTTPError) -> str:
    """读取 HTTPError 响应体（解 gzip），透传上游真实错误（如 QWeather 的 Invalid Host/Key）。"""
    try:
        raw = e.read()
        cenc = (e.headers or {}).get('Content-Encoding', '') if e.headers else ''
        if cenc == 'gzip':
            raw = gzip.decompress(raw)
        elif cenc == 'deflate':
            raw = zlib.decompress(raw)
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return str(e)


def _b64url(b: bytes) -> bytes:
    return base64.urlsafe_b64encode(b).rstrip(b'=')


def _make_qweather_jwt(key: str, ttl: int = 3600) -> str:
    """和风天气 JWT（HS256，共享密钥 = API KEY）。payload.sub 必须为 API KEY。"""
    header = _b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    now = int(time.time())
    payload = _b64url(json.dumps({'sub': key, 'iat': now, 'exp': now + ttl}).encode())
    signing = header + b'.' + payload
    sig = hmac.new(key.encode(), signing, hashlib.sha256).digest()
    return (signing + b'.' + _b64url(sig)).decode()


def _http_get(url: str, timeout: int = 8, encoding: str = 'utf-8', headers: dict | None = None) -> str:
    hdrs = {'User-Agent': 'Mozilla/5.0 (compatible; WorkBuddy/1.0)', 'Accept': '*/*'}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return _decode_resp(resp, encoding)


def _http_get_bytes(url: str, timeout: int = 8, headers: dict | None = None) -> bytes:
    """原始字节抓取：XML 解析必须用字节——ET.fromstring 不接受「带 encoding 声明的 str」，
    而 RSS/Atom 普遍以 <?xml version="1.0" encoding="UTF-8"?> 开头。"""
    hdrs = {'User-Agent': 'Mozilla/5.0 (compatible; WorkBuddy/1.0)', 'Accept': '*/*'}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------------------------------------------------------------------------
# 兜底占位数据（与前端 api/workbench.ts 旧占位结构保持一致，保证渲染不崩）
# ---------------------------------------------------------------------------
_PLACEHOLDER_WEATHER = {
    'city': '上海',
    'temp': 28,
    'condition': '多云',
    'high': 31,
    'low': 24,
    'forecast': [
        {'day': '周五', 'cond': '多云', 'high': 31, 'low': 24},
        {'day': '周六', 'cond': '晴', 'high': 33, 'low': 25},
        {'day': '周日', 'cond': '小雨', 'high': 29, 'low': 23},
    ],
    # 当日详情扩展字段（无 Key 占位时给出合理示例值）
    'now': {
        'icon': '101',
        'feels': 30,
        'humidity': 65,
        'windDir': '东风',
        'windScale': '3',
        'vis': '25',
        'pressure': '1006',
    },
    # 24 小时预报占位曲线（正弦近似：凌晨最低、午后最高），附图标/风向风力
    'hourly': [
        {
            'time': f'{h:02d}:00',
            'temp': round(26 + 5 * math.sin((h - 8) * math.pi / 12)),
            'icon': '100' if 6 <= h <= 18 else '150',
            'text': '晴' if 6 <= h <= 18 else '晴(夜)',
            'windDir': '东风',
            'windScale': '3',
        }
        for h in range(24)
    ],
    # 7 天预报占位（附白天图标）
    'daily7': [
        {'day': '周五', 'date': '2026-09-04', 'cond': '多云', 'high': 31, 'low': 24, 'icon': '101', 'windDir': '东风', 'windScale': '3'},
        {'day': '周六', 'date': '2026-09-05', 'cond': '晴', 'high': 33, 'low': 25, 'icon': '100', 'windDir': '东南风', 'windScale': '2'},
        {'day': '周日', 'date': '2026-09-06', 'cond': '小雨', 'high': 29, 'low': 23, 'icon': '305', 'windDir': '北风', 'windScale': '4'},
        {'day': '周一', 'date': '2026-09-07', 'cond': '多云', 'high': 30, 'low': 24, 'icon': '101', 'windDir': '东风', 'windScale': '3'},
        {'day': '周二', 'date': '2026-09-08', 'cond': '晴', 'high': 32, 'low': 25, 'icon': '100', 'windDir': '南风', 'windScale': '2'},
        {'day': '周三', 'date': '2026-09-09', 'cond': '阴', 'high': 28, 'low': 22, 'icon': '104', 'windDir': '西北风', 'windScale': '3'},
        {'day': '周四', 'date': '2026-09-10', 'cond': '小雨', 'high': 27, 'low': 21, 'icon': '305', 'windDir': '北风', 'windScale': '4'},
    ],
    # 无 Key 占位的日出日落（示例值，仅用于演示 UI；真实数据由和风天文接口返回）
    'sunrise': '06:12',
    'sunset': '18:45',
    'source': 'placeholder',
}

_PLACEHOLDER_BIDDING = [
    {
        'id': 1,
        'title': '某市服务器采购项目公开招标公告',
        'source': 'ccgp.gov.cn',
        'url': 'https://www.ccgp.gov.cn',
        'publishedAt': '2026-08-24 09:12',
        'summary': '采购内容含机架式服务器 80 台及配套存储，面向政务云扩容……（占位数据：未配置抓取源或抓取失败）',
        'budget': '¥1,280,000',
        'keywords': ['服务器', '采购'],
        'body': '',
        'bodyAvailable': None,
    },
    {
        'id': 2,
        'title': '产业园 EPC 总承包监理招标',
        'source': 'cebpubservice.com',
        'url': 'https://www.cebpubservice.com',
        'publishedAt': '2026-08-22 16:40',
        'summary': '工程总承包+全过程监理，资格要求具备相应资质……（占位数据）',
        'deadline': '2026-09-05',
        'keywords': ['EPC', '监理'],
        'body': '',
        'bodyAvailable': None,
    },
]

_DEFAULT_QUOTE = {'text': '千里之行，始于足下。', 'author': '老子'}


# ===========================================================================
# 1) 天气 —— 和风天气 QWeather
# ===========================================================================

# 城市名 → QWeather LocationID 本地表。
# 和风 LocationID 长期稳定（形如 101020100），内置常用城市即可覆盖绝大多数场景，
# 无需依赖 GeoAPI 服务——很多免费/受限版凭证未开通 GeoAPI，直接调
# geo/v2/city/lookup 会被「安全设置」拦截返回 403 Security Restriction，导致整条天气失败。
_CITY_LOCID = {
    '北京': '101010100', '上海': '101020100', '天津': '101030100', '重庆': '101040100',
    '广州': '101280101', '深圳': '101280601', '杭州': '101210101', '南京': '101190101',
    '成都': '101270101', '武汉': '101200101', '西安': '101110101', '苏州': '101190401',
    '郑州': '101180101', '长沙': '101250101', '沈阳': '101070101', '青岛': '101120201',
    '大连': '101070201', '厦门': '101230201', '福州': '101230101', '济南': '101120101',
    '合肥': '101220101', '昆明': '101290101', '哈尔滨': '101050101', '长春': '101060101',
    '石家庄': '101090101', '太原': '101100101', '南昌': '101240101', '南宁': '101300101',
    '贵阳': '101260101', '海口': '101310101', '兰州': '101160101', '乌鲁木齐': '101130101',
    '呼和浩特': '101080101', '银川': '101170101', '西宁': '101150101', '拉萨': '101140101',
    '宁波': '101210401', '无锡': '101190201', '佛山': '101280800', '东莞': '101281901',
    '珠海': '101280701', '中山': '101281801', '常州': '101191101', '嘉兴': '101210301',
    '温州': '101210701', '金华': '101210901', '绍兴': '101210501', '南通': '101190501',
    '徐州': '101190801', '泉州': '101230501', '烟台': '101120501', '潍坊': '101120601',
    '临沂': '101121001', '惠州': '101280301', '扬州': '101190701', '镇江': '101190601',
    '汕头': '101280501', '湛江': '101281201', '桂林': '101300501', '三亚': '101310201',
    '丽江': '101291401', '绵阳': '101270701', '赣州': '101240701', '芜湖': '101220301',
    '株洲': '101251001', '岳阳': '101251401', '常德': '101250701', '柳州': '101300301',
    '香港': '101320101', '澳门': '101330101', '台北': '101340101', '高雄': '101340201',
    '台中': '101340401', '台南': '101340501',
}


def _resolve_location(city: str, host: str, key_suffix: str, auth_headers) -> str | None:
    """城市名 / 数字 LocationID → QWeather LocationID。

    - 纯数字（6~12 位）视为用户直接填写的 LocationID，原样返回；
    - 命中内置中文城市表直接返回（不依赖 GeoAPI，避免安全限制）；
    - 否则回退 GeoAPI 在线解析（未开通 GeoAPI 的凭证会失败，调用方据此提示用户）。"""
    c = (city or '').strip()
    if re.fullmatch(r'\d{6,12}', c):
        return c
    if c in _CITY_LOCID:
        return _CITY_LOCID[c]
    if c.endswith('市') and c[:-1] in _CITY_LOCID:
        return _CITY_LOCID[c[:-1]]
    try:
        loc = json.loads(
            _http_get(
                f'https://{host}/geo/v2/city/lookup?location={urllib.parse.quote(c)}{key_suffix}',
                headers=auth_headers,
            )
        )
        return loc.get('location', [{}])[0].get('id')
    except Exception:
        return None


def _open_meteo_sun(city: str) -> dict | None:
    """免费免 Key 的日出日落兜底源（Open-Meteo）。

    和风天气的 astronomy（日出日落）接口在受限免费版 host（re.qweatherapi.com）或
    未开通天文权限的 Key 上会 404/403，导致 sunrise/sunset 恒为空。此函数作为独立兜底，
    不依赖用户 Key，用 Open-Meteo 公共 API（中文地名 → 经纬度 → 当日日出日落）补全。
    完全独立容错：任意环节失败都返回 None，由调用方决定是否忽略。
    """
    try:
        q = urllib.parse.quote(city)
        geo = json.loads(_http_get(f'https://geocoding-api.open-meteo.com/v1/search?name={q}&count=1&language=zh'))
        res = geo.get('results')
        if not res:
            return None
        lat = res[0]['latitude']
        lon = res[0]['longitude']
        fc = json.loads(
            _http_get(
                f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}'
                f'&daily=sunrise,sunset&timezone=Asia%2FShanghai&forecast_days=1'
            )
        )
        d = fc.get('daily') or {}
        sr = (d.get('sunrise') or [None])[0]
        ss = (d.get('sunset') or [None])[0]
        if not sr or not ss:
            return None
        # Open-Meteo 返回本地时间 'YYYY-MM-DDTHH:MM'，截出 HH:MM
        return {'sunrise': sr[11:16], 'sunset': ss[11:16]}
    except Exception:  # noqa: BLE001
        return None


def _qweather() -> dict | None:
    # 优先用前端传入（用户在工作台设置页填写的）Key/Host，回退到服务端环境变量
    key = (request.headers.get('X-QWeather-Key') or '').strip() or os.environ.get('QWEATHER_KEY')
    if not key:
        return None
    host = (
        (request.headers.get('X-QWeather-Host') or '').strip()
        or os.environ.get('QWEATHER_HOST', 'api.qweather.com')
    )
    # 容错：用户可能把完整 URL（含 https:// 与末尾 /）填进接入点，去掉 scheme 与末尾斜杠，
    # 否则会拼成 https://https://host/... 导致连接失败
    host = host.replace('https://', '').replace('http://', '').strip('/')
    # 认证方式：key=API KEY 查询参数；jwt=JWT Bearer（和风推荐，2027 起免限流）
    auth = (request.headers.get('X-QWeather-Auth') or 'key').strip().lower()
    city = request.args.get('city', '上海').strip() or '上海'
    if auth == 'jwt':
        auth_headers = {'Authorization': f'Bearer {_make_qweather_jwt(key)}'}
        key_suffix = ''
    else:
        auth_headers = None
        key_suffix = f'&key={key}'

    def _fetch(endpoint: str):
        # 统一封装端点请求；LocationID 已解析，这里只拼 endpoint
        return _http_get(f'https://{host}/{endpoint}?location={loc_id}{key_suffix}', headers=auth_headers)

    try:
        # 城市名 → LocationID：优先本地表，避免触发 GeoAPI 安全限制（见 _CITY_LOCID 说明）
        loc_id = _resolve_location(city, host, key_suffix, auth_headers)
        if not loc_id:
            return {
                'source': 'error',
                'error': '无法解析城市「%s」：该和风凭证可能未开通 GeoAPI（地理解析）服务，'
                         '导致城市名解析被安全设置拦截。可在和风控制台为该 Key 开通 GeoAPI，'
                         '或直接填写 LocationID（如 上海=101020100）。' % city,
                'city': city,
            }
        # 核心：实时 + 3 天概览（失败即整条天气失败，需透传上游真实错误）
        now = json.loads(_fetch('v7/weather/now'))['now']
        daily = json.loads(_fetch('v7/weather/3d'))['daily']
    except urllib.error.HTTPError as e:
        # 透传上游真实错误（如 403 Invalid Host / Invalid KEY / Security Restriction），便于定位
        return {'source': 'error', 'error': f'QWeather HTTP {e.code}: {_http_err_body(e)[:280]}', 'city': city}
    except Exception as e:  # noqa: BLE001
        return {'source': 'error', 'error': str(e)[:200], 'city': city}

    week = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

    def _weekday(fx_date: str) -> str:
        y, m, d = (int(x) for x in fx_date.split('-'))
        return week[date(y, m, d).weekday()]

    # 3 天概览（卡片正面用）
    forecast = []
    for d in daily[:3]:
        forecast.append(
            {'day': _weekday(d['fxDate']), 'cond': d.get('textDay', ''), 'high': int(d['tempMax']), 'low': int(d['tempMin'])}
        )

    # 当日详情扩展字段（温感/湿度/风/能见度/气压/图标），缺失字段用合理兜底
    now_detail = {
        'icon': now.get('icon', ''),
        'feels': int(now.get('feelsLike') or now.get('temp') or 0),
        'humidity': int(now.get('humidity') or 0),
        'windDir': now.get('windDir', ''),
        'windScale': now.get('windScale', ''),
        'vis': now.get('vis', ''),
        'pressure': now.get('pressure', ''),
    }

    # 24 小时预报（独立容错降级：整段失败只给空列表，不影响 now + 3d 核心）
    # 每个节点额外带图标 / 文字 / 风向风力，供折线图下方节点展示
    hourly: list[dict] = []
    try:
        h24 = json.loads(_fetch('v7/weather/24h'))['hourly']
        for h in h24:
            # fxTime 形如 2026-09-04T14:00+08:00 → 取 HH:MM
            fx = h.get('fxTime', '')
            hourly.append(
                {
                    'time': fx[11:16] if len(fx) >= 16 else fx,
                    'temp': int(h.get('temp', 0)),
                    'icon': h.get('icon', ''),
                    'text': h.get('text', ''),
                    'windDir': h.get('windDir', ''),
                    'windScale': h.get('windScale', ''),
                }
            )
    except Exception:  # noqa: BLE001
        hourly = []

    # 7 天预报（独立容错降级：同上）；带白天图标与日间风向风力
    daily7: list[dict] = []
    try:
        d7 = json.loads(_fetch('v7/weather/7d'))['daily']
        for d in d7:
            daily7.append(
                {
                    'day': _weekday(d['fxDate']),
                    'date': d.get('fxDate', ''),
                    'cond': d.get('textDay', ''),
                    'high': int(d['tempMax']),
                    'low': int(d['tempMin']),
                    'icon': d.get('iconDay', ''),
                    'windDir': d.get('windDirDay', ''),
                    'windScale': d.get('windScaleDay', ''),
                }
            )
    except Exception:  # noqa: BLE001
        daily7 = []

    # 日出日落：优先用和风 astronomy 接口（数据最贴合用户所选 LocationID）。
    # 和风受限免费版 host（re.qweatherapi.com）或未开通天文权限的 Key 上该接口会 404/403，
    # 此时回退到免 Key 的 Open-Meteo 公共源，确保真实 Key 用户也能看到日出日落。
    astro = {'sunrise': '', 'sunset': ''}
    try:
        date_str = datetime.now().strftime('%Y%m%d')
        astro_url = f'https://{host}/v7/astronomy/sunrise-sunset?location={loc_id}&date={date_str}{key_suffix}'
        a = json.loads(_http_get(astro_url, headers=auth_headers))
        if a.get('code') == '200' and a.get('sunrise'):
            astro = {'sunrise': a.get('sunrise', ''), 'sunset': a.get('sunset', '')}
    except Exception:  # noqa: BLE001
        astro = {'sunrise': '', 'sunset': ''}
    # 兜底：和风 astronomy 不可用（受限版 Key / 未开通权限 / 解析失败）时用 Open-Meteo
    if not astro['sunrise']:
        fb = _open_meteo_sun(city)
        if fb:
            astro = fb

    return {
        'city': city,
        'temp': int(now['temp']),
        'condition': now.get('text', ''),
        'high': forecast[0]['high'] if forecast else int(now['temp']),
        'low': forecast[0]['low'] if forecast else int(now['temp']),
        'forecast': forecast,
        'now': now_detail,
        'hourly': hourly,
        'daily7': daily7,
        'sunrise': astro['sunrise'],
        'sunset': astro['sunset'],
        'source': 'qweather',
    }


def _om_geocode(city: str):
    """城市名 → (纬度, 经度)，复用 Open-Meteo 地理编码（免密钥）。失败返回 None。"""
    try:
        q = urllib.parse.quote(city)
        geo = json.loads(_http_get(f'https://geocoding-api.open-meteo.com/v1/search?name={q}&count=1&language=zh'))
        res = geo.get('results')
        if not res:
            return None
        return res[0]['latitude'], res[0]['longitude']
    except Exception:  # noqa: BLE001
        return None


def _sun_history(city: str, start: str, end: str) -> dict:
    """历史日出日落：城市 → 经纬度（Open-Meteo 地理编码）→ 历史档案 API。

    用 archive-api.open-meteo.com/v1/archive 拉取指定区间的 daily=sunrise,sunset，
    返回 [{date, sunrise, sunset}]。历史数据不变，调用方用长 TTL 缓存（30 天）。
    完全独立容错：任意环节失败返回 {'source':'error', ...}，不抛异常。"""
    geo = _om_geocode(city)
    if not geo:
        return {'source': 'error', 'error': f'无法将城市「{city}」解析为经纬度（Open-Meteo 地理编码失败）', 'city': city}
    lat, lon = geo
    # Open-Meteo 历史档案仅覆盖到「真实今天」；若区间 end 落在未来会直接报错
    #（end_date out of allowed range），导致当前年/月/周整段无数据。统一把 end 截断到今天，
    # 并保证 start<=end，使「未走完的周期只返回已过去日期的数据（未来日期暂不显示）」。
    today = datetime.now().strftime('%Y-%m-%d')
    if end > today:
        end = today
    if start > end:
        start = end
    try:
        url = (
            f'https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}'
            f'&daily=sunrise,sunset&start_date={start}&end_date={end}&timezone=Asia%2FShanghai'
        )
        fc = json.loads(_http_get(url, timeout=12))
        d = fc.get('daily') or {}
        times = d.get('time') or []
        srs = d.get('sunrise') or []
        sss = d.get('sunset') or []
        days: list[dict] = []
        for i, t in enumerate(times):
            sr = (srs[i] if i < len(srs) else None) or ''
            ss = (sss[i] if i < len(sss) else None) or ''
            # Open-Meteo 在指定时区下返回 'YYYY-MM-DDTHH:MM'，截出 HH:MM
            if 'T' in sr:
                sr = sr.split('T', 1)[1]
            if 'T' in ss:
                ss = ss.split('T', 1)[1]
            days.append({'date': t, 'sunrise': sr, 'sunset': ss})
        return {'city': city, 'start': start, 'end': end, 'days': days, 'source': 'open-meteo-archive'}
    except Exception as e:  # noqa: BLE001
        return {'source': 'error', 'error': str(e)[:200], 'city': city}


@bp.get('/sun-history')
def sun_history():
    city = request.args.get('city', '上海').strip() or '上海'
    start = request.args.get('start', '').strip()
    end = request.args.get('end', '').strip()
    if not start or not end:
        return jsonify({'source': 'error', 'error': '缺少 start/end 参数（格式 YYYY-MM-DD）', 'city': city}), 400
    key = f'sun:{city}:{start}:{end}'
    data = _cached(key, TTL.get('sun', 2592000), lambda: _sun_history(city, start, end))
    return jsonify(data)


@bp.get('/weather')
def weather():
    city = request.args.get('city', '上海').strip() or '上海'
    # refresh=1 跳过缓存强制重抓（手动刷新按钮 / 定时刷新都走此通道，保证拿到最新数据）
    refresh = request.args.get('refresh') == '1'
    data = _cached(f'weather:{city}', TTL['weather'], _qweather, force=refresh)
    if data is None:
        data = {**_PLACEHOLDER_WEATHER, 'city': city}
    return jsonify(data)


# ===========================================================================
# 2) 自选股实时行情 —— 腾讯财经 qt.gtimg.cn（免密钥）
# ===========================================================================
def _norm_stock_code(raw: str) -> str:
    """将用户输入的股票代码归一化为腾讯财经所需的带前缀形式。
    - 已带 sh/sz/bj 前缀保持不变
    - 6/5/1 开头（沪市主板/科创板、沪市 ETF/基金/可转债等）→ sh
    - 0/3/2 开头（深市主板/创业板、深市 ETF/基金/可转债等）→ sz
    - 4/8 开头（北交所）→ bj；其它原样返回"""
    raw = raw.strip().lower()
    if raw[:2] in ('sh', 'sz', 'bj'):
        return raw
    if raw[:1] in ('6', '5', '1'):
        return 'sh' + raw
    if raw[:1] in ('0', '3', '2'):
        return 'sz' + raw
    if raw[:1] in ('4', '8'):
        return 'bj' + raw
    return raw


@bp.get('/stock')
def stock():
    codes = request.args.get('codes', '').strip()
    if not codes:
        return jsonify([])
    # 归一化：补交易所前缀，并保留 原始代码→归一代码 映射以便回显
    raw_list = [c.strip() for c in codes.split(',') if c.strip()]
    norm_map = {_norm_stock_code(c): c for c in raw_list}
    query = ','.join(norm_map.keys())
    try:
        # 腾讯财经返回 GBK 编码，字段以 ~ 分隔；网络抖动时内部重试，并缓存 15s
        text = _cached('stock:' + query, TTL['stock'], lambda: _fetch_stock(query))
    except Exception:
        return jsonify([])

    items = []
    for line in text.split(';'):
        line = line.strip()
        if not line.startswith('v_'):
            continue
        var_name, _, payload = line.partition('=')
        norm = var_name[2:]  # 去掉 "v_" 前缀，得到归一化代码（如 sh600519）
        code = norm_map.get(norm, norm)  # 回显为用户原始输入（含/不含前缀都行）
        payload = payload.strip().strip('"')
        if not payload:
            continue
        f = payload.split('~')
        try:
            items.append(
                {
                    'code': code,
                    'name': f[1],
                    'price': float(f[3]),
                    'prevClose': float(f[4]),
                    'changePct': float(f[32]),
                }
            )
        except (IndexError, ValueError):
            continue
    return jsonify(items)


def _fetch_stock(query: str) -> str:
    """拉取腾讯财经行情文本，遇到网络抖动最多重试 3 次。"""
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            return _http_get('https://qt.gtimg.cn/q=' + query, encoding='gbk', timeout=8)
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.3 * (attempt + 1))
    raise last_err or RuntimeError('stock fetch failed')


# ===========================================================================
# 3) 招标信息 —— 爬虫抓取 + 关键词匹配（失败兜底占位）
# ===========================================================================
def _load_sources() -> list[dict]:
    raw = os.environ.get('WORKBENCH_BIDDING_SOURCES')
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                return parsed
        except Exception:
            pass
    return [
        {
            'url': 'https://cgjy.tobacco.com.cn/',
            'name': '中烟电子采购平台',
            'keywords': ['布带', '吸丝带'],
            'searchUrl': 'https://cgjy.tobacco.com.cn/search.jspx?q={kw}',
            'fetchBody': True,
        },
        {
            # 中招公共服务平台：强反爬 SPA（阿里云 WAF + 网易易盾 + 加密接口），
            # 后端 urllib 直抓 0 命中，必须走无头浏览器渲染后抽 DOM。
            # 首页为通用中招聚合页（不按关键词搜索），故默认 keywords 留空展示最新公告；
            # 如需按关键词监控，可在前端设置里追加（下钻搜索页能力后续可扩展）。
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
        },
    ]


def _parse_anchors(page_html: str) -> list[dict]:
    """用正则抽取所有 <a href>文本</a>，去标签、去空白、去 HTML 实体。"""
    anchors = []
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', page_html, re.S | re.I):
        href = m.group(1)
        text = re.sub(r'<[^>]+>', '', m.group(2))
        text = re.sub(r'\s+', ' ', html.unescape(text)).strip()
        if text:
            anchors.append({'text': text, 'href': href})
    return anchors


_DATE_RE = re.compile(r'(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})')


def _extract_date(text: str) -> str:
    m = _DATE_RE.search(text)
    if m:
        return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    return ''


# 详情页抓取上限：控制手动刷新时的总请求数与延迟（列表命中再多也只下钻前 N 条）
DETAIL_CAP = 12


# ---------------------------------------------------------------------------
# JSON API 模式（自定义源 type=api）：请求明文 JSON 接口、按路径取列表、按字段映射提取
# ---------------------------------------------------------------------------
def _json_get_path(obj, path: str):
    """按点路径（支持数组索引 a[0].b）从嵌套 JSON 取值；path 为空返回 obj 本身。

    例：_json_get_path({'data': {'list': [1,2]}}, 'data.list') → [1, 2]；
        _json_get_path({'a': [{'b': 9}]}, 'a[0].b') → 9。"""
    if not path or not isinstance(obj, (dict, list)):
        return obj if not path else None
    cur = obj
    for part in path.split('.'):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^([^\[]+)((?:\[\d+\])*)$', part)
        if not m:
            return None
        key = m.group(1)
        idxs = re.findall(r'\[(\d+)\]', part)
        try:
            if key:
                cur = cur[key]
            for idx in idxs:
                cur = cur[int(idx)]
        except (KeyError, IndexError, TypeError):
            return None
    return cur


def _api_field(item: dict, key: str | None) -> str:
    """按字段 key（可为点路径）从 JSON item 取值并转字符串；缺省 / 非标量返回空串。"""
    if not key:
        return ''
    v = _json_get_path(item, key)
    if v is None or isinstance(v, (dict, list)):
        return ''
    return str(v).strip()


def _fetch_api_source(src: dict) -> list[dict]:
    """抓取单个 type=api 的自定义源：

    - 请求 ``apiUrl`` 模板（含 ``{kw}`` 则按关键词逐个搜索，否则抓全量列表）；
    - 按 ``itemPath`` 取列表（如 ``data.list``），按 ``fields`` 映射提取
      标题/链接/日期/摘要/正文；
    - 非搜索模式下按 标题+摘要 命中任一关键词才保留；
    - 产出结构与 html 模式一致：body 非空即 bodyAvailable=True；body 空且开启
      fetchBody 则标 ``_body_candidate`` 交由后续详情下钻补全正文。

    适合「有明文 JSON 接口的站点」：企业内网招投标系统、商业标讯 API、
    RSS-to-JSON 网关（如 rss2json）、自建聚合服务等——不依赖站点是否反爬。"""
    api_url = (src.get('apiUrl') or '').strip()
    if not api_url:
        return []
    kws = src.get('keywords', []) or []
    fields = src.get('fields') or {}
    item_path = (src.get('itemPath') or '').strip()
    fetch_body = src.get('fetchBody', True)
    src_name = (src.get('name') or '').strip() or urllib.parse.urlparse(api_url).netloc
    is_search = bool('{kw}' in api_url and kws)

    # 接口鉴权：申请的 Key/Token 通过请求头携带（仅 type=api 生效）
    api_headers: dict | None = None
    api_key = (src.get('apiKey') or '').strip()
    if api_key:
        api_header = (src.get('apiHeader') or '').strip() or 'Authorization'
        # 自定义头名原样发送；默认 Authorization 按 Bearer 方案
        api_headers = {api_header: api_key if api_header != 'Authorization' else f'Bearer {api_key}'}

    pages: list[tuple[str, str | None]] = []
    if is_search:
        for kw in kws:
            pages.append((api_url.replace('{kw}', urllib.parse.quote(kw)), kw))
    else:
        pages.append((api_url, None))

    out: list[dict] = []
    seen: set[str] = set()
    for page_url, kw in pages:
        try:
            text = _http_get(page_url, timeout=12, encoding='utf-8', headers=api_headers)
            data = json.loads(text)
        except Exception:
            continue
        items = _json_get_path(data, item_path)
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            title = _api_field(it, fields.get('title') or 'title')
            url = _api_field(it, fields.get('url') or 'url')
            date_raw = _api_field(it, fields.get('date') or 'date')
            summary = _api_field(it, fields.get('summary') or 'summary')
            body = _api_field(it, fields.get('body') or 'body')
            if not title and not url:
                continue
            # 关键词匹配：搜索模式接口已按词搜，保留全部；否则需标题/摘要命中其一
            if kw:
                title_ok = True
            elif kws:
                title_ok = any(k in (title + ' ' + summary) for k in kws)
            else:
                title_ok = True
            if not title_ok:
                continue
            if url and not url.startswith('http'):
                url = urllib.parse.urljoin(page_url, url)
            if not url:
                continue
            key = url.split('?')[0]
            if key in seen:
                continue
            seen.add(key)
            if body:
                body_available: bool | None = True
                body_candidate = False
            elif fetch_body:
                body_available = None
                body_candidate = True
            else:
                body_available = None
                body_candidate = False
            out.append(
                {
                    'id': abs(hash(key)) % 10**9,
                    'title': title or url,
                    'source': src_name,
                    'sourceName': src_name,
                    'sourceUrl': api_url,
                    'url': url,
                    'publishedAt': _extract_date(date_raw)
                    + ((' ' + _extract_time(date_raw)) if _extract_time(date_raw) else ''),
                    'summary': summary,
                    'budget': '',
                    'deadline': '',
                    'keywords': kws,
                    'body': body,
                    'bodyAvailable': body_available,
                    '_fetch_body': fetch_body,
                    '_body_candidate': body_candidate,
                    '_enriched': True,
                }
            )
    return out


# ---------------------------------------------------------------------------
# RSS / Atom 订阅模式（自定义源 type=rss）：直接解析明文 XML 订阅源，不受反爬影响
# ---------------------------------------------------------------------------
def _feed_local(tag: str) -> str:
    """取带命名空间标签的本地名（去掉 {ns} 前缀），如 {http://...Atom}entry → entry。"""
    return tag.rsplit('}', 1)[-1] if '}' in tag else tag


def _feed_text(el, *names: str) -> str:
    """在 el 的直接子节点中按本地名查找首个匹配的非空文本（去空白）。"""
    for c in el:
        if _feed_local(c.tag) in names and c.text and c.text.strip():
            return c.text.strip()
    return ''


def _feed_link(item) -> str:
    """兼容 RSS <link>文本 与 Atom <link href>（优先 rel=alternate）。"""
    rss_text = None
    atom_href = None
    atom_alt = None
    for c in item:
        if _feed_local(c.tag) != 'link':
            continue
        href = c.get('href')
        if href:
            rel = c.get('rel')
            if rel == 'alternate':
                atom_alt = href
            elif atom_href is None:
                atom_href = href
        elif c.text and c.text.strip():
            rss_text = c.text.strip()
    return atom_alt or atom_href or rss_text or ''


def _feed_date(raw: str) -> str:
    """把 RSS(RFC822)/Atom(ISO8601) 日期归一为 'YYYY-MM-DD HH:MM'。"""
    raw = (raw or '').strip()
    if not raw:
        return ''
    # RFC822：Wed, 28 Aug 2026 10:00:00 +0000
    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            if dt.tzinfo is not None:
                dt = dt.astimezone()
            return dt.strftime('%Y-%m-%d %H:%M')
    except Exception:
        pass
    # ISO8601：2026-08-25T10:00:00Z（Atom）；统一转为本地时间，与 RFC822 口径一致
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if dt.tzinfo is not None:
            dt = dt.astimezone()
        return dt.strftime('%Y-%m-%d %H:%M')
    except Exception:
        pass
    # 回退：ISO / 中文式日期
    d = _extract_date(raw)
    t = _extract_time(raw)
    return (d + ((' ' + t) if t else '')).strip()


def _fetch_rss_source(src: dict) -> list[dict]:
    """抓取单个 type=rss 的订阅源：

    - 直接拉取 ``url``（RSS 2.0 或 Atom 订阅地址），用标准库 xml.etree 解析；
    - 兼容 RSS（channel/item）与 Atom（feed/entry），命名空间无关匹配；
    - 每条取 标题 / 链接 / 发布时间 / 摘要（description/summary，剥离 HTML）；
      若含 content/content:encoded 则作为正文 body；
    - 按 ``keywords`` 过滤（标题+摘要命中任一关键词才保留；无关键词则全留）；
    - 产出结构与 html / api 模式一致：body 非空即 bodyAvailable=True，否则标
      ``_body_candidate`` 交由详情下钻补全（反爬站点下钻失败则 bodyAvailable=False，
      摘要仍能满足「命中→点开看源」的聚合需求）。"""
    feed_url = (src.get('url') or '').strip()
    if not feed_url:
        return []
    kws = src.get('keywords', []) or []
    fetch_body = src.get('fetchBody', True)
    src_name = (src.get('name') or '').strip() or urllib.parse.urlparse(feed_url).netloc
    try:
        # 必须按字节解析：ET.fromstring 不接受「带 encoding 声明的 str」，而 feed 普遍带声明
        raw = _http_get_bytes(feed_url, timeout=12)
        root = ET.fromstring(raw)
    except Exception:
        return []

    # 收集 item / entry（本地名匹配，忽略命名空间）
    items: list = []
    for el in root.iter():
        if _feed_local(el.tag) in ('item', 'entry'):
            items.append(el)
    if not items:
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for it in items:
        title = _html_to_text(_feed_text(it, 'title')) if _feed_text(it, 'title') else ''
        link = _feed_link(it)
        if not link:
            continue
        if not link.startswith('http'):
            link = urllib.parse.urljoin(feed_url, link)
        date_raw = _feed_text(it, 'pubDate', 'published', 'updated', 'date')
        summary_raw = _feed_text(it, 'description', 'summary', 'content')
        body_raw = _feed_text(it, 'content', 'encoded')
        summary = _html_to_text(summary_raw) if summary_raw else ''
        body = _html_to_text(body_raw) if body_raw else ''

        if not title and not summary:
            continue
        # 关键词过滤：标题+摘要命中任一关键词才保留
        if kws:
            hay = title + ' ' + summary
            if not any(k in hay for k in kws):
                continue
        key = link.split('?')[0]
        if key in seen:
            continue
        seen.add(key)
        if body:
            body_available: bool | None = True
            body_candidate = False
        elif fetch_body:
            body_available = None
            body_candidate = True
        else:
            body_available = None
            body_candidate = False
        out.append(
            {
                'id': abs(hash(key)) % 10**9,
                'title': title or link,
                'source': src_name,
                'sourceName': src_name,
                    'sourceUrl': feed_url,
                    'url': link,
                    'publishedAt': _feed_date(date_raw),
                    'summary': summary,
                    'budget': '',
                    'deadline': '',
                    'keywords': kws,
                    'body': body,
                    'bodyAvailable': body_available,
                    '_fetch_body': fetch_body,
                    '_body_candidate': body_candidate,
                    '_enriched': True,
            }
        )
    return out


def _run_browser_fetch(cfg: dict) -> str:
    """把配置写到临时文件，subprocess 调 node browser_fetch.js，回收 stdout 的 JSON。

    用临时文件传参（而非 stdin），避免 JSON 转义/管道/BOM 在跨进程传递时出错。"""
    if not os.path.exists(_BROWSER_FETCH_JS):
        return ''
    if not _NODE_BIN or not os.path.isfile(_NODE_BIN):
        # 浏览器抓取静默失败会让前端表现为「刷新无变化」，必须留痕
        logging.warning('[browser-fetch] Node 可执行文件不存在：%r（可用 WORKBENCH_NODE_BIN 覆盖）', _NODE_BIN)
        return ''
    try:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False)
            cfg_path = f.name
    except Exception:
        return ''
    try:
        env = dict(os.environ)
        env['NODE_PATH'] = _NODE_PATH
        proc = subprocess.run(
            [_NODE_BIN, _BROWSER_FETCH_JS, cfg_path],
            capture_output=True, text=True, timeout=_BROWSER_TIMEOUT, env=env,
        )
        out = (proc.stdout or '').strip()
        if not out:
            logging.warning(
                '[browser-fetch] 抓取无输出 rc=%s stderr=%s',
                proc.returncode, (proc.stderr or '')[:500],
            )
        return out
    except Exception as e:
        logging.warning('[browser-fetch] 抓取异常：%s', e)
        return ''
    finally:
        try:
            os.unlink(cfg_path)
        except Exception:
            pass


def _fetch_browser_source(src: dict) -> list[dict]:
    """type=browser：无头浏览器（playwright-core + 系统 Edge，stealth 模式）渲染反爬 SPA
    站点，等 SPA 解密/渲染完成后按 CSS 选择器抽取列表项，并入统一命中结构。

    适用：WAF + 加密接口 + 无 RSS 的强反爬站点（如 ctbpsp.com 中招公共服务平台）。
    后端 urllib 直抓会被 WAF 拦截且无明文接口，必须走真实浏览器渲染后抽 DOM 才能拿到
    真实招标数据（标题/日期/摘要）。正文抓不到（SPA 无 <a href> 详情链接）时摘要仍能
    满足「命中→点开看源」的聚合需求，故默认 fetchBody=False（不下钻）。"""
    warmup_url = (src.get('url') or src.get('warmupUrl') or '').strip()
    if not warmup_url:
        return []
    src_name = (src.get('name') or '').strip() or urllib.parse.urlparse(warmup_url).netloc
    kws = src.get('keywords', []) or []
    fetch_body = bool(src.get('fetchBody', False))  # 浏览器渲染源已自带摘要，默认不下钻

    cfg = {
        'warmupUrl': warmup_url,
        'waitSelector': src.get('waitSelector') or src.get('itemSelector'),
        'waitTimeout': int(src.get('waitTimeout') or 30000),
        'itemSelector': src.get('itemSelector') or 'body',
        'titleSelector': src.get('titleSelector') or '',
        'linkSelector': src.get('linkSelector') or '',
        'summarySelector': src.get('summarySelector') or '',
        'dateRegex': src.get('dateRegex') or '',
        'baseUrl': (src.get('baseUrl') or warmup_url).strip(),
        'maxItems': int(src.get('maxItems') or 30),
        'stealth': src.get('stealth', True),
        'channel': src.get('channel') or 'msedge',
        # 关键词搜索模式：有关键词且指定搜索框选择器时，由浏览器脚本逐关键词驱动站点搜索框
        'keywords': kws,
        'searchInputSelector': (src.get('searchInputSelector') or '').strip(),
        'searchButtonSelector': (src.get('searchButtonSelector') or '').strip(),
        # 全文/标题切换开关选择器（如 ctbpsp 的 '.el-switch.switchStyle'）；
        # 配置后浏览器脚本会在关键词搜索开始前确保开关处于「全文」模式（OFF）。
        'searchFullTextToggleSelector': (src.get('searchFullTextToggleSelector') or '').strip(),
        # 搜索触发方式：dom（模拟输入+点按钮，通用） / vue（直调页面组件方法）。
        # ctbpsp 在按钮 click 时拉起易盾滑块并 disable 按钮，必须走 vue 直调。
        'searchInvoke': (src.get('searchInvoke') or 'dom').strip(),
        'vueMethod': (src.get('vueMethod') or 'getlist').strip(),
        'searchGapMs': int(src.get('searchGapMs') or 2000),
        # 持久化浏览器 profile：保留 cookie，显著降低 WAF/易盾风控命中率。
        # 缺省使用项目内 .cache/edge-profile（首次访问后 cookie 自动复用）。
        'userDataDir': (src.get('userDataDir') or _DEFAULT_EDGE_PROFILE).strip(),
        # 有头模式：ctbpsp 对 headless 指纹敏感，无头下搜索必弹人机验证。
        'headful': bool(src.get('headful', True)),
    }
    raw = _run_browser_fetch(cfg)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, dict) and data.get('error'):
        return []
    if not isinstance(data, list):
        return []

    out: list[dict] = []
    seen: set[str] = set()      # 按「标题+日期」去重（反爬 SPA 链接兜底为基址，需用标题区分）
    for it in data:
        if not isinstance(it, dict):
            continue
        title = (it.get('title') or '').strip()
        if not title:
            continue
        url = (it.get('url') or cfg['baseUrl']).strip()
        if not url:
            continue
        summary = (it.get('summary') or '').strip()
        published_at = (it.get('publishedAt') or '').strip()
        # 关键词过滤与命中归属：
        #   - 站点已按关键词全文搜索过（browser 搜索模式）时**默认信任其结果**，仅标注
        #     标题是否命中（titleHit）。若仍按「标题+摘要」二次硬过滤，正文含关键词但
        #     标题不含的标讯会被全部丢弃 —— 等于退回「只搜标题」，正是本次要修的问题。
        #   - 非搜索模式、或显式 trustSiteSearch=False 时，才按 标题+摘要 硬过滤降噪。
        site_searched = bool(cfg.get('searchInputSelector')) and bool(kws)
        trust = bool(src.get('trustSiteSearch', site_searched))
        title_hit = any(k in title for k in kws) if kws else True
        if kws and not trust:
            hay = title + ' ' + summary
            if not any(k in hay for k in kws):
                continue
        # 反爬 SPA 详情页常无 <a href>，所有项 URL 兜底为站点基址（相同），
        # 故按「标题+日期」去重，避免把整页不同公告折叠成 1 条。
        key = (title + '|' + published_at).strip()
        if key in seen:
            continue
        seen.add(key)
        # 浏览器渲染源已自带标题/日期/摘要（_enriched=True）；bodyAvailable 视 fetchBody 决定
        if fetch_body:
            body_available: bool | None = None
            body_candidate = True
        else:
            body_available = None
            body_candidate = False
        out.append(
            {
                'id': abs(hash(key)) % 10**9,
                'title': title,
                'source': src_name,
                'sourceName': src_name,
                'sourceUrl': warmup_url,
                'url': url,
                'publishedAt': published_at,
                'summary': summary,
                'budget': '',
                'deadline': '',
                'keywords': kws,
                'body': '',
                'bodyAvailable': body_available,
                '_fetch_body': fetch_body,
                '_body_candidate': body_candidate,
                '_enriched': True,
            }
        )
    return out


def _fetch_bidding(sources: list[dict]) -> list[dict]:
    """抓取各源页面，按关键词匹配链接；命中项若开启 fetchBody，则并行下钻详情页，
    提取标题 / 发布时间 / 正文。正文抓不到时 bodyAvailable=False 并标记。

    每个源支持两种抓取模式：
      - 普通模式：提供 ``url``（首页/栏目页），直接抓取该页、按关键词过滤链接。
      - 搜索模式：提供 ``searchUrl`` 模板（含 ``{kw}`` 占位符），对每个关键词替换后
        分别抓取搜索结果页、合并命中。适合「首页不含关键词、需进搜索结果页」的站点
        （如中烟电子采购平台 cgjy.tobacco.com.cn）。"""
    raw_hits: list[dict] = []
    seen: set[str] = set()
    for src in sources:
        stype = src.get('type')
        # JSON API 模式：直接请求明文接口并按字段映射提取，不走 HTML 解析
        if stype == 'api':
            raw_hits.extend(_fetch_api_source(src))
            if len(raw_hits) >= 30:
                break
            continue
        # RSS / Atom 订阅模式：直接解析明文 XML 订阅源，不受反爬影响
        if stype == 'rss':
            raw_hits.extend(_fetch_rss_source(src))
            if len(raw_hits) >= 30:
                break
            continue
        # 浏览器渲染模式：无头浏览器加载反爬 SPA、等解密渲染后按 CSS 选择器抽 DOM
        if stype == 'browser':
            raw_hits.extend(_fetch_browser_source(src))
            if len(raw_hits) >= 30:
                break
            continue
        url = (src.get('url') or '').strip()
        kws = src.get('keywords', []) or []
        fetch_body = src.get('fetchBody', True)
        search_url = (src.get('searchUrl') or '').strip()
        src_name = (src.get('name') or '').strip() or urllib.parse.urlparse(url or '').netloc
        is_search = bool(search_url and '{kw}' in search_url and kws)
        if not url and not search_url:
            continue
        # 构造要抓取的页面列表：(page_url, matched_keyword_or_None)
        pages: list[tuple[str, str | None]] = []
        if is_search:
            for kw in kws:
                pages.append((search_url.replace('{kw}', urllib.parse.quote(kw)), kw))
        else:
            if not url:
                continue
            pages.append((url, None))
        base_netloc = urllib.parse.urlparse(url or pages[0][0]).netloc
        per_src = 0
        for page_url, kw in pages:
            try:
                html_text = _http_get(page_url, timeout=10, encoding='utf-8')
            except Exception:
                continue
            for a in _parse_anchors(html_text):
                t = a['text']
                if len(t) < 6:
                    continue
                # 标题是否命中关键词（普通模式按任一关键词；搜索模式按当前关键词）
                if kw:
                    title_ok = kw in t
                elif kws:
                    title_ok = any(k in t for k in kws)
                else:
                    title_ok = True
                # 普通模式：仅保留标题命中（首页不含关键词只能靠标题）。
                # 搜索模式：标题未命中关键词的也暂存为「待正文核验」候选，
                # 因为部分结果标题不含关键词、但详情页正文与关键词相关（用户要求正文也匹配）。
                if not title_ok and not is_search:
                    continue
                href = a['href']
                if href and not href.startswith('http'):
                    href = urllib.parse.urljoin(page_url, href)
                if not href:
                    continue
                key = href.split('?')[0]
                if key in seen:
                    continue
                seen.add(key)
                raw_hits.append(
                    {
                        'id': abs(hash(key)) % 10**9,
                        'title': t,
                        'source': src_name,
                        'sourceName': src_name,
                        'sourceUrl': url,
                        'url': href,
                        'publishedAt': _extract_date(t) + ((' ' + _extract_time(t)) if _extract_time(t) else ''),
                        'summary': '',
                        'budget': '',
                        'deadline': '',
                        'keywords': kws,
                        'body': '',
                        'bodyAvailable': None,  # None=未下钻；True/False=下钻结果
                        '_fetch_body': fetch_body,
                        '_body_candidate': (not title_ok),  # 标题未命中、需靠正文核验才保留
                    }
                )
                per_src += 1
                if per_src >= 12 or len(raw_hits) >= 30:
                    break
            if per_src >= 12 or len(raw_hits) >= 30:
                break
        if len(raw_hits) >= 30:
            break

    # 详情页下钻（并行）：标题已命中的优先下钻，剩余名额给「待正文核验」候选。
    # 抓取后：标题命中的直接保留；正文候选仅当正文确实含关键词才保留（否则丢弃噪音）。
    # api/rss 源（标 _enriched）已自带 标题/日期/摘要，仅当开启 fetchBody 才下钻补正文；
    # html 源列表页没有这些字段，仍照旧下钻补全标题/日期/正文（行为不变）。
    def _need_drill(h: dict) -> bool:
        if h.get('_body_candidate'):
            return True
        return bool(h.get('_fetch_body')) or not h.get('_enriched')

    title_hits = [h for h in raw_hits if not h.get('_body_candidate') and _need_drill(h)]
    body_cands = [h for h in raw_hits if h.get('_body_candidate')]
    to_fetch = (title_hits + body_cands)[:DETAIL_CAP]
    if to_fetch:
        with ThreadPoolExecutor(max_workers=6) as ex:
            futs = {ex.submit(_fetch_detail, h['url']): h for h in to_fetch}
            for fut in as_completed(futs):
                h = futs[fut]
                try:
                    d = fut.result()
                except Exception:
                    d = None
                if d:
                    # 标题：仅当原链接标题偏短或不含关键词时，才用详情页标题补充，
                    # 避免站点通用 <title>（如「货物招标 - 中烟电子采购平台」）覆盖搜索结果里更精确的中文公告标题。
                    dtitle = _clean_title(d.get('title') or '')
                    orig = _clean_title((h['title'] or '').strip())
                    _kws = h.get('keywords') or []
                    # 优先采用详情页真实标题（dtitle），因为搜索结果页的链接文字常含面包屑
                    # （如「货物招标 … 发布日期：… 详情」），而详情页 <h2> 才是纯公告标题。
                    # 仅当详情页标题缺失或明显更短/更不精确时，才保留搜索结果链接文字。
                    if dtitle and (not orig or len(dtitle) > len(orig)
                                   or (not any(k in orig for k in _kws) and any(k in dtitle for k in _kws))):
                        h['title'] = dtitle
                    else:
                        h['title'] = orig or (h['title'] or '')
                    if d.get('publishedAt'):
                        h['publishedAt'] = d['publishedAt']
                    body = d.get('body', '')
                    # 详情页正文若为站点通用导航骨架（以「首页」开头且明显为菜单），
                    # 视为未抓到正文，标记不可获取，避免混入噪音。
                    if body and not _looks_like_nav(body):
                        h['body'] = body
                        h['bodyAvailable'] = True
                    else:
                        h['bodyAvailable'] = False
                else:
                    h['bodyAvailable'] = False

    # 最终过滤：丢弃「标题未命中且正文也未命中关键词」的噪音候选
    final: list[dict] = []
    for h in raw_hits:
        if h.get('_body_candidate'):
            body = h.get('body') or ''
            if not (h.get('bodyAvailable') and body and any(k in body for k in (h['keywords'] or []))):
                continue
        final.append(h)
    for h in final:
        h.pop('_fetch_body', None)
        h.pop('_body_candidate', None)
        h.pop('_enriched', None)
    return final


def _extract_time(text: str) -> str:
    m = re.search(r'(\d{1,2}):(\d{2})', text)
    return f'{int(m.group(1)):02d}:{m.group(2)}' if m else ''


# --------------------------------------------------------------------------
# 详情页解析：标题 / 发布时间 / 正文
# --------------------------------------------------------------------------
def _html_to_text(page_html: str) -> str:
    """去 script/style 后剥离标签、反转义、压缩空白，得到纯文本。"""
    page_html = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', ' ', page_html, flags=re.S | re.I)
    text = re.sub(r'<[^>]+>', ' ', page_html)
    text = html.unescape(text)
    return re.sub(r'\s+', ' ', text).strip()


def _clean_title(t: str) -> str:
    """清理详情页 <h2> 包裹的面包屑/噪音，提取纯公告标题。

    例如「货物招标 山西昆明烟草…中标候选人公示 发布日期：2026-08-26 详情」
    清洗为「山西昆明烟草…中标候选人公示」。"""
    if not t:
        return ''
    t = re.sub(r'发布日期[：:]\s*\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}(?:\s*\d{1,2}:\d{2})?', ' ', t)
    t = re.sub(r'^(货物招标|工程招标|服务招标|招标公告|中标公告|结果公告|中标候选人公示)\s*', '', t)
    t = re.sub(r'\s*详情$', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t[:200]


def _extract_title(page_html: str) -> str:
    """优先取页面正文标题（og:title → h1 → h2），最后才回退 <title>。

    原因：部分站点（如中烟电子采购平台 cgjy.tobacco.com.cn）的 <title> 是整站
    通用名（「货物招标 - 中烟电子采购平台」），公告真实标题在 <h2> 内。若先取
    <title> 会用站点通用名覆盖搜索结果里的精确公告标题，导致卡片标题显示错误。"""
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', page_html, re.I)
    if m:
        t = _clean_title(html.unescape(m.group(1)))
        if t:
            return t
    for tag in ('h1', 'h2'):
        for mm in re.finditer(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), page_html, re.S | re.I):
            t = re.sub(r'<[^>]+>', '', mm.group(1))
            t = _clean_title(html.unescape(t))
            # 跳过过短 / 疑似导航栏目标题（如「首页」「相关推荐」）
            if len(t) >= 4 and t[:2] != '首页' and '相关推荐' not in t:
                return t
    m = re.search(r'<title[^>]*>(.*?)</title>', page_html, re.S | re.I)
    if m:
        t = _clean_title(re.sub(r'<[^>]+>', '', m.group(1)))
        if t:
            return t
    return ''


def _extract_publish_time(page_html: str) -> str:
    """优先 meta 发布时间标签，否则在详情页正文里取首个日期（+时间）。"""
    for pat in (
        r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+itemprop=["\']datePublished["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+name=["\']publishdate["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+name=["\']pubdate["\'][^>]+content=["\']([^"\']+)',
    ):
        m = re.search(pat, page_html, re.I)
        if m:
            val = m.group(1).strip()
            d = _extract_date(val)
            tm = _extract_time(val)
            if d:
                return d + ((' ' + tm) if tm else '')
    text = _html_to_text(page_html)
    d = _extract_date(text)
    if d:
        return d + ((' ' + _extract_time(text)) if _extract_time(text) else '')
    return ''


_NAV_TOKENS = ('首页', '招采公告', '公开招标项目', '非公开招标项目', '采购结果', '结果公告',
               '结果公示', '中标候选人公示', '流标公告', '通知公告', '规章制度', '服务协议')


def _looks_like_nav(text: str) -> bool:
    """粗判一段纯文本是否为站点通用导航骨架（而非真实公告正文）。

    许多详情页抓取失败时拿到的是整站菜单文本，通常以「首页」开头并堆砌大量栏目名。
    命中多个导航 token 时判定为导航噪音，避免混入卡片误导用户。"""
    if not text:
        return False
    head = text[:40]
    if '首页' not in head:
        return False
    hits = sum(1 for t in _NAV_TOKENS if t in text)
    return hits >= 3


def _extract_body(page_html: str) -> str:
    """优先 <article>/<main>，否则取含文字最多的 <div>；过短视为抓取失败返回空。"""
    for tag in ('article', 'main'):
        m = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), page_html, re.S | re.I)
        if m:
            t = _html_to_text(m.group(1))
            if len(t) >= 30:
                return t[:800]
    best = ''
    for m in re.finditer(r'<div\b[^>]*>(.*?)</div>', page_html, re.S | re.I):
        t = _html_to_text(m.group(1))
        if len(t) > len(best):
            best = t
    return best[:800] if len(best) >= 30 else ''


def _fetch_detail(url: str) -> dict | None:
    """抓取并解析单个详情页，返回 {title, publishedAt, body} 或 None（抓取失败）。"""
    try:
        page_html = _http_get(url, timeout=6, encoding='utf-8')
    except Exception:
        return None
    if not page_html:
        return None
    return {
        'title': _extract_title(page_html),
        'publishedAt': _extract_publish_time(page_html),
        'body': _extract_body(page_html),
    }


@bp.get('/bidding')
def bidding():
    # 招标信息已持久化到数据库：默认读库（页面加载即时返回，无需重抓）；
    # refresh=1 触发抓取并仅新增未入库条目；sources=JSON 由前端传入抓取源配置。
    force = request.args.get('refresh') == '1'
    raw = request.args.get('sources')
    sources = None
    used_default = False
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                sources = parsed
        except Exception:
            sources = None
    if not sources:
        # 前端未传 / 传空：使用内置默认源（仅这种情况才允许占位兜底）
        sources = _load_sources()
        used_default = True

    # 读取前先清理半年以上旧数据（自动删除）
    _prune_bids()

    if force:
        # 手动刷新：抓取 → 仅新增未入库条目 → 返回库内全部（含历史）
        try:
            hits = _fetch_bidding(sources)
        except Exception:
            hits = []
        _persist_bids(hits)
        items, fetched_at = _read_bids()
    else:
        # 非强制：优先读库；库空则引导首次抓取入库，保证首屏即有内容
        items, fetched_at = _read_bids()
        if not items:
            try:
                hits = _fetch_bidding(sources)
            except Exception:
                hits = []
            if hits:
                _persist_bids(hits)
                items, fetched_at = _read_bids()

    if not items:
        # 库空且真抓不到：仅当用户未配置任何源（used_default）才回退占位演示数据
        items = _PLACEHOLDER_BIDDING if used_default else []
        fetched_at = None
    return jsonify({'items': items, 'fetchedAt': fetched_at})


def _bidding_cache_key(sources: list[dict]) -> str:
    """按源配置哈希生成缓存键，不同源配置互不串扰。"""
    blob = json.dumps(sources, ensure_ascii=False, sort_keys=True)
    return 'bidding:' + hashlib.md5(blob.encode('utf-8')).hexdigest()[:16]


# ---------------------------------------------------------------------------
# 招标信息数据库持久化（跨设备共享、仅新增、自动清理半年以上）
# ---------------------------------------------------------------------------
def _parse_dt(s: str | None):
    if not s:
        return None
    s = s.strip()
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _prune_bids():
    """删除发布时间（缺省回退入库时间）超过 180 天的条目。"""
    cutoff = datetime.now() - timedelta(days=180)
    to_delete = []
    for r in BiddingItem.query.all():
        ref = r.published_at or r.fetched_at
        if ref and ref < cutoff:
            to_delete.append(r)
    if to_delete:
        for r in to_delete:
            db.session.delete(r)
        db.session.commit()


def _persist_bids(hits: list[dict]):
    """将抓取命中入库：按 link 唯一键去重。

    - 新链接：INSERT。
    - 已存在链接：UPSERT —— 刷新时同步最新标题/正文/来源名，使标题提取改进（如
      改用 <h2> 真实公告标题）能在下次刷新后生效，而不是被旧的错误标题永久卡住。
      正文仅在本次抓取成功、或库内尚为空时才覆盖，避免瞬时抓取失败把已有正文清空。
    """
    now = datetime.now()
    # 去重键：复合 (link, title)。反爬 SPA 源（ctbpsp）所有项 link 同为站点基址，
    # 仅靠 link 去重会把同页多条公告折叠成 1 条；加 title 后同页不同公告可并存。
    rows = {(r.link, r.title): r for r in BiddingItem.query.all()}
    # 批次内去重：同一批 hits 中若两条 (link,title) 相同（如两个关键词搜索都命中同一条
    # ctbpsp 公告，链接均兜底为站点基址），首条已 INSERT，第二条若再 INSERT 会触发复合唯一约束；
    # 故用 seen_batch 跳过重复，避免 IntegrityError。
    seen_batch = set()
    added = 0
    updated = 0
    for h in hits:
        link = (h.get('url') or '').strip()
        if not link:
            continue
        title = (h.get('title') or '')[:400]
        key = (link, title)
        if key in seen_batch:
            continue
        seen_batch.add(key)
        src_name = h.get('sourceName') or h.get('source') or ''
        pub = _parse_dt(h.get('publishedAt'))
        body = h.get('body') or ''
        ba = h.get('bodyAvailable')
        summary = h.get('summary') or ''
        kws = json.dumps(h.get('keywords') or [], ensure_ascii=False)
        r = rows.get((link, title))
        if r is None:
            db.session.add(BiddingItem(
                source_url=h.get('sourceUrl') or '',
                source_name=src_name,
                title=title,
                link=link,
                published_at=pub,
                body=body,
                body_available=ba,
                summary=summary,
                keywords=kws,
                fetched_at=now,
            ))
            added += 1
        else:
            if title:
                r.title = title
            r.source_name = src_name
            if pub:
                r.published_at = pub
            r.keywords = kws
            # 摘要始终同步最新值：反爬 SPA 源（ctbpsp）的列表页元数据是唯一可展示内容，
            # 刷新后必须更新，否则内容行空白。body 仅在本次成功抓取或库内尚为空时才覆盖。
            if summary:
                r.summary = summary
            if ba is True or not r.body:
                r.body = body
                r.body_available = ba
            r.fetched_at = now
            updated += 1
    if added or updated:
        db.session.commit()
    return added


def _read_bids() -> tuple[list[dict], str | None]:
    """从数据库读取全部招标条目，按时间倒序返回（前端再做时间分段过滤）。
    返回 (条目列表, 最近一次实际入库/抓取时间 YYYY-MM-DD HH:MM 或 None)。
    fetched_at 取自全部条目中最新的 fetched_at，反映「真实抓取数据时间」，而非前端请求时刻。"""
    rows = BiddingItem.query.all()
    fetched_at = max((r.fetched_at for r in rows), default=None)
    fetched_at = fetched_at.strftime('%Y-%m-%d %H:%M') if fetched_at else None

    def _ref(r: BiddingItem):
        return r.published_at or r.fetched_at or datetime.min

    rows.sort(key=_ref, reverse=True)
    out = []
    for r in rows:
        try:
            kws = json.loads(r.keywords or '[]')
        except Exception:
            kws = []
        out.append(
            {
                'id': r.id,
                'title': r.title,
                'source': r.source_name,
                'sourceName': r.source_name,
                'sourceUrl': r.source_url,
                'url': r.link,
                'publishedAt': r.published_at.strftime('%Y-%m-%d %H:%M') if r.published_at else '',
                'summary': r.summary or '',
                'budget': '',
                'deadline': '',
                'keywords': kws,
                'body': r.body or '',
                'bodyAvailable': r.body_available,
                # 关键词是否命中在标题；false = 站点全文搜索命中（关键词在正文），
                # 前端据此标注「正文命中」徽标。统一在此计算，保证历史条目同样可标注。
                'titleHit': (not kws) or any(k in (r.title or '') for k in kws),
            }
        )
    return out, fetched_at


# ===========================================================================
# 4) 每日名言 —— 一言 hitokoto（免密钥，CORS 友好，这里仍走代理）
# ===========================================================================
def _hitokoto() -> dict | None:
    try:
        data = json.loads(
            _http_get('https://v1.hitokoto.cn/?c=i&c=d&c=k&encode=json', timeout=6)
        )
        return {
            'text': data.get('hitokoto', ''),
            'author': data.get('from_who') or data.get('from') or '佚名',
        }
    except Exception:
        return None


@bp.get('/quote')
def quote():
    force = request.args.get('fresh') == '1'
    data = _cached('quote', TTL['quote'], _hitokoto, force=force)
    if data is None:
        data = _DEFAULT_QUOTE
    return jsonify(data)


# ===========================================================================
# 4.5) 实时热搜榜单 —— 免密钥聚合（apizero / uapis 可切换），后端代理 + 缓存 + 归一化
# ---------------------------------------------------------------------------
# 设计要点：
#   - 上游两个免密钥公开聚合源，结构不同，后端统一归一化为
#     {items:[{rank,title,url,heat,label}], updatedAt, source}
#   - provider 参数：auto（默认，apizero 优先）/ apizero / uapis 三选一；
#     前端设置页可切换数据源。
#   - auto 模式下，apizero 返回结果会做「平台域名校验」：已知 apizero 对
#     douyin/toutiao/baidu 会串台返回 B 站榜单（URL 全是 bilibili.com），
#     一旦多数条目域名不匹配即视为不可用，自动回退 uapis，避免「点抖音跳 B 站」。
#   - 进程内缓存 60s（TTL['hotlist']），缓存 key 含 provider/src/limit；
#     错误结果不缓存。平台白名单（与前端 HOTLIST_SRCS 严格对齐，内部 key 即 uapis type）。
# 注：apizero 仅 weibo/zhihu/bilibili/tieba 返回真实数据，其余（含 douyin/baidu/toutiao）
# 会回退成微博；auto 模式靠下方域名校验自动丢弃并回退 uapis。uapis 对所有平台返回真实数据。
# 平台 logo 取自 uapis 官方图标（web/src/assets/hotlist/*.png，由 uapis.cn/icons/hotboard 抓取）。
# ===========================================================================
_HOTLIST_SRCS = (
    'weibo', 'zhihu', 'zhihu-daily', 'bilibili', 'douyin', 'xiaohongshu', 'baidu', 'tieba',
    '52pojie', 'coolapk', 'thepaper', 'toutiao', 'qq-news', 'netease-news',
    'huxiu', 'sspai', 'ithome', '36kr', 'nodeseek',
    'hellogithub', 'netease-music', 'qq-music',
)
_HOTLIST_APIZERO = 'https://v1.apizero.cn/api/hot-search?platform={src}&limit={limit}'
_HOTLIST_UAPIS = 'https://uapis.cn/api/v1/misc/hotboard?type={src}&limit={limit}'
# uapis 与 apizero 的平台命名不完全一致；内部 key 统一采用 uapis type，
# 仅对 apizero 需要的少数平台在此映射（其余 apizero 不支持，靠域名校验回退 uapis）。
_HOTLIST_UAPIS_TYPE = {}
# 各平台期望主域名，用于校验数据源返回是否串台（apizero 把不支持的平台回退成微博时即被丢弃）。
_HOTLIST_DOMAINS = {
    'weibo': 'weibo.com',
    'zhihu': 'zhihu.com',
    'zhihu-daily': 'zhihu.com',
    'bilibili': 'bilibili.com',
    'douyin': 'douyin.com',
    'xiaohongshu': 'xiaohongshu.com',
    'baidu': 'baidu.com',
    'tieba': 'tieba.baidu.com',
    '52pojie': '52pojie.com',
    'coolapk': 'coolapk.com',
    'thepaper': 'thepaper.cn',
    'toutiao': 'toutiao.com',
    'qq-news': 'news.qq.com',
    'netease-news': 'news.163.com',
    'huxiu': 'huxiu.com',
    'sspai': 'sspai.com',
    'ithome': 'ithome.com',
    '36kr': '36kr.com',
    'nodeseek': 'nodeseek.com',
    'hellogithub': 'hellogithub.com',
    'netease-music': 'music.163.com',
    'qq-music': 'y.qq.com',
}
_HOTLIST_PROVIDERS = ('auto', 'apizero', 'uapis')

# 跨请求限速闸门（免费上游 QPS 极低，需串行化避免突发超频被 429）
import threading
_HL_RATELOCK = threading.Lock()
_HL_LAST_CALL: dict[str, float] = {}
_HL_MIN_INTERVAL = {'apizero': 1.1, 'uapis': 0.7}  # 秒：两次同上游调用之间最小间隔

# 上次成功结果（按 src+limit 维度，与 provider 无关，因为归一化输出等价）。
# 用途：auto 模式下两个上游都失败（常见于限流 429 / 上游临时故障）时，
# 回退展示这份「最近一次成功」的缓存，避免整张卡片空白报错。
# 仅记录真正成功的信封（source∈{apizero,uapis} 且有条目）；TTL 过期后不再当作可用。
# 同时落盘（instance/hotlist_lastgood.json），重启也不丢，冷启动后曾有数据即可兜底。
_HOTLIST_LASTGOOD: dict[tuple, dict] = {}
_HOTLIST_LASTGOOD_TTL = 6 * 3600  # 6 小时内视为可用缓存
# 熔断：上游整体失败后冷却一段时间再重试，避免持续高频打上游把限流越打越死。
# 采用指数退避：首次失败冷却 BASE，之后每次翻倍（封顶 MAX），给上游充分静默期恢复；
# 成功取数后清零，立即恢复正常探活。这样即便上游长时间限流，也不会被我们持续触碰而永不恢复。
_HOTLIST_FAIL_UNTIL: dict[tuple, float] = {}
_HOTLIST_FAIL_COUNT: dict[tuple, int] = {}
_HOTLIST_FAIL_BACKOFF_BASE = 120  # 秒：首次失败后冷却 2 分钟
_HOTLIST_FAIL_BACKOFF_MAX = 3600  # 秒：封顶 1 小时


def _hotlist_cache_path() -> str:
    """instance/hotlist_lastgood.json；无 app 上下文时回退到项目/instance。"""
    try:
        from flask import current_app
        base = current_app.instance_path
    except Exception:
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance')
    return os.path.join(base, 'hotlist_lastgood.json')


def _hotlist_load_cache() -> None:
    """启动时把落盘的 lastgood 载入内存（失败静默）。"""
    try:
        p = _hotlist_cache_path()
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            for k, v in raw.items():
                try:
                    s, l = k.split('|')
                    _HOTLIST_LASTGOOD[(s, int(l))] = v
                except Exception:
                    continue
    except Exception:
        pass


def _hotlist_save_cache() -> None:
    """把内存 lastgood 落盘（失败静默）。"""
    try:
        p = _hotlist_cache_path()
        raw = {f'{s}|{l}': v for (s, l), v in _HOTLIST_LASTGOOD.items()}
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(raw, f, ensure_ascii=False)
    except Exception:
        pass


def _hotlist_keep_good(src: str, limit: int, data: dict) -> None:
    """成功取到数据后写入 lastgood 缓存（仅成功结果，错误信封忽略）并落盘。"""
    if isinstance(data, dict) and data.get('source') in ('apizero', 'uapis') and data.get('items'):
        _HOTLIST_LASTGOOD[(src, limit)] = {'data': data, 'ts': time.time()}
        _hotlist_save_cache()


def _hotlist_in_backoff(src: str, limit: int) -> bool:
    """是否处于失败冷却期（冷却期内不探上游，直接走缓存兜底）。"""
    return time.time() < _HOTLIST_FAIL_UNTIL.get((src, limit), 0)


def _hotlist_mark_fail(src: str, limit: int) -> None:
    """上游整体失败后进入指数退避冷却，避免持续触发限流。"""
    n = _HOTLIST_FAIL_COUNT.get((src, limit), 0) + 1
    _HOTLIST_FAIL_COUNT[(src, limit)] = n
    interval = min(_HOTLIST_FAIL_BACKOFF_BASE * (2 ** (n - 1)), _HOTLIST_FAIL_BACKOFF_MAX)
    _HOTLIST_FAIL_UNTIL[(src, limit)] = time.time() + interval


def _hotlist_clear_fail(src: str, limit: int) -> None:
    """成功取数后清零失败计数，恢复正常探活。"""
    _HOTLIST_FAIL_COUNT.pop((src, limit), None)
    _HOTLIST_FAIL_UNTIL.pop((src, limit), None)


_hotlist_load_cache()


def _http_get_json(url: str, timeout: int = 8, headers: dict | None = None) -> dict:
    """抓取并解析 JSON；解 gzip（_http_get 已处理），解析失败抛异常交给上层回退。"""
    text = _http_get(url, timeout=timeout, headers=headers)
    return json.loads(text)

# ---------------------------------------------------------------------------
# 翻译代理（DeepSeek，OpenAI 兼容 chat/completions）
# ---------------------------------------------------------------------------
_DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
_DEEPSEEK_KNOWN = ('deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro')


def _translate_deepseek(text: str, from_lang: str, to_lang: str, model: str,
                        api_key: str, timeout: int = 40) -> str:
    """调 DeepSeek chat/completions 翻译；失败抛异常，由路由层转成 {ok:False}。"""
    sys_prompt = (
        '你是资深外贸翻译专家，只翻译用户提供的正文，不解释、不补充、不输出多余内容。\n'
        '规则：\n'
        '1. 严格保留所有数字、型号、规格、单位、货币、日期、专有名词（品牌/公司/港口/条款）原文；\n'
        '2. 使用国际贸易通行术语与正式商务语气（如 FOB、CIF、L/C、B/L、Proforma Invoice 等保持英文或按惯例处理）；\n'
        '3. 不增删原文信息、不臆造；遇到歧义按外贸实务最合理译法处理；\n'
        f'4. 将{from_lang}译为{to_lang}；若源语言为自动识别，请先判断源语言再翻译。'
    )
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': sys_prompt},
            {'role': 'user', 'content': text},
        ],
        'temperature': 1.0 if model == 'deepseek-reasoner' else 0.3,
        'stream': False,
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        _DEEPSEEK_URL,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + api_key,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; WorkBuddy/1.0)',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        cenc = resp.headers.get('Content-Encoding', '')
        if cenc == 'gzip':
            body = gzip.decompress(body)
        elif cenc == 'deflate':
            body = zlib.decompress(body)
        obj = json.loads(body.decode('utf-8', errors='replace'))
    choices = obj.get('choices') or []
    if not choices:
        raise RuntimeError('DeepSeek 返回为空')
    return (choices[0].get('message', {}) or {}).get('content', '').strip()


def _host_of(url: str) -> str:
    """取 URL 的主机名（小写），无则空串。"""
    m = re.match(r'https?://([^/]+)/?', url or '')
    return m.group(1).lower() if m else ''


def _items_match_platform(items: list[dict], src: str) -> bool:
    """校验榜单条目是否真的属于该平台：多数条目 URL 命中平台主域名才算过关。
    用于拦截 apizero 把 douyin/toutiao/baidu 串成 B 站数据的上游 bug。"""
    if not items:
        return False
    want = _HOTLIST_DOMAINS.get(src, '')
    if not want:
        return True
    ok = sum(1 for it in items if want in _host_of(str(it.get('url') or '')))
    return ok >= max(1, len(items) // 2)


def _normalize_apizero(payload: dict, src: str) -> list[dict]:
    """apizero 结构：data.platforms.<src>.items[] = {rank,title,hot,label,url,mobile_url}
    平台键既可能是 src 本身，也可能是别名（bili），二者都尝试，都取不到时退而取第一个平台。"""
    platforms = payload.get('data', {}).get('platforms', {})
    aliased = 'bilibili' if src == 'bili' else src
    bucket = platforms.get(src) or platforms.get(aliased) or next(iter(platforms.values()), {})
    items = (bucket or {}).get('items', [])
    out = []
    for it in items:
        out.append({
            'rank': int(it.get('rank') or 0),
            'title': str(it.get('title') or ''),
            'url': str(it.get('url') or it.get('mobile_url') or ''),
            'heat': str(it.get('hot') or ''),
            'label': str(it.get('label') or ''),
        })
    return out


def _normalize_uapis(payload: dict) -> list[dict]:
    """uapis 结构：list[] = {index,title,url,hot_value,extra}"""
    items = payload.get('list', [])
    out = []
    for it in items:
        out.append({
            'rank': int(it.get('index') or 0),
            'title': str(it.get('title') or ''),
            'url': str(it.get('url') or ''),
            'heat': str(it.get('hot_value') or ''),
            'label': '',
        })
    return out


def _hl_throttle(which: str) -> None:
    """跨请求限速闸门：免费上游有极低 QPS（apizero 实测 limit_qps=1），
    并行抓取多个平台会瞬间超频被 429。用进程内锁 + 最小间隔串行化，
    既尊重上游限流又避免把限流越打越死。"""
    with _HL_RATELOCK:
        now = time.time()
        interval = _HL_MIN_INTERVAL.get(which, 1.0)
        wait = interval - (now - _HL_LAST_CALL.get(which, 0.0))
        if wait > 0:
            time.sleep(min(wait, 2.0))
        _HL_LAST_CALL[which] = time.time()


def _fetch_apizero(src: str, limit: int) -> dict | None:
    """主源 apizero；返回归一化信封或 None（失败/串台）。"""
    try:
        _hl_throttle('apizero')
        payload = _http_get_json(_HOTLIST_APIZERO.format(src=src, limit=limit), timeout=8)
        items = _normalize_apizero(payload, src)
        # 校验是否真的属于该平台，串台（如 douyin→B站）直接视为不可用
        if items and _items_match_platform(items, src):
            return {
                'items': items[:limit],
                'updatedAt': str(payload.get('data', {}).get('generated_at') or ''),
                'source': 'apizero',
            }
        if items:
            logging.warning('[hotlist] apizero 串台 src=%s，放弃回退', src)
    except Exception as e:  # noqa: BLE001
        logging.warning('[hotlist] apizero 失败 src=%s: %s', src, e)
    return None


def _fetch_uapis(src: str, limit: int, ukey: str | None = None) -> dict | None:
    """备源 uapis（平台命名需按映射转换）；返回归一化信封或 None。
    ukey 为 uapis 会员 API Key，提供时附 Authorization: Bearer 头走会员通道。"""
    try:
        _hl_throttle('uapis')
        utype = _HOTLIST_UAPIS_TYPE.get(src, src)
        headers = {'Authorization': 'Bearer ' + ukey} if ukey else None
        payload = _http_get_json(_HOTLIST_UAPIS.format(src=utype, limit=limit), timeout=8, headers=headers)
        items = _normalize_uapis(payload)
        if items:
            return {
                'items': items[:limit],
                'updatedAt': str(payload.get('update_time') or ''),
                'source': 'uapis',
            }
    except Exception as e:  # noqa: BLE001
        logging.warning('[hotlist] uapis 失败 src=%s: %s', src, e)
    return None


def _fetch_hotlist(src: str, limit: int, provider: str = 'auto', ukey: str | None = None) -> dict:
    """按 provider 取数：
    - apizero / uapis：仅用指定源，失败返回 error 信封；
    - auto（默认）：apizero 优先，失败或串台自动回退 uapis；双源皆失败返回 error。
    - ukey：uapis 会员 API Key（Bearer），提供时 uapis 走会员通道（更高额度），缺失则用访客额度。
    """
    if provider == 'apizero':
        d = _fetch_apizero(src, limit)
        if d:
            return d
        return {'items': [], 'updatedAt': '', 'source': 'error', 'message': 'apizero 暂不可用，请稍后重试'}

    if provider == 'uapis':
        d = _fetch_uapis(src, limit, ukey)
        if d:
            return d
        return {'items': [], 'updatedAt': '', 'source': 'error', 'message': 'uapis 暂不可用，请稍后重试'}

    # auto：apizero 优先 → 失败/串台回退 uapis
    d = _fetch_apizero(src, limit)
    if d:
        return d
    d = _fetch_uapis(src, limit, ukey)
    if d:
        return d
    return {'items': [], 'updatedAt': '', 'source': 'error', 'message': '上游数据源暂时不可用或限流，请稍后重试'}


@bp.get('/hotlist')
def hotlist():
    src = (request.args.get('src') or 'weibo').strip()
    if src not in _HOTLIST_SRCS:
        src = 'weibo'
    provider = (request.args.get('provider') or 'auto').strip()
    if provider not in _HOTLIST_PROVIDERS:
        provider = 'auto'
    try:
        limit = int(request.args.get('limit') or '20')
    except ValueError:
        limit = 20
    limit = max(1, min(50, limit))
    # 缓存 TTL 跟随用户在设置页选择的刷新间隔：间隔内只读缓存、不重复打上游，
    # 从源头避免频繁请求触发上游限流（如 uapis 对本机 IP 的限流）。
    # 间隔过短（<30s）或缺失时回落默认 60s，避免 TTL 过小失去缓存意义。
    try:
        interval = int(request.args.get('interval') or '0')
    except ValueError:
        interval = 0
    interval = max(0, min(interval, 86400))
    ttl = interval if interval >= 30 else TTL['hotlist']
    # uapis 会员 Key：提供时 uapis 走会员通道（更高额度）；作为缓存 key 一部分，
    # 使会员/访客两份缓存互不串用（数据相同但配额不同）。
    ukey = (request.args.get('ukey') or '').strip() or None
    # 缓存 key 含 provider：切换数据源即时生效（不再命中旧源缓存）
    # 熔断：处于失败冷却期则直接走缓存兜底，不再打上游（避免持续触发限流）
    cache_key = 'hotlist:' + provider + ':' + src + ':' + str(limit) + (':k' if ukey else '')
    if _hotlist_in_backoff(src, limit):
        good = _HOTLIST_LASTGOOD.get((src, limit))
        if good and (time.time() - good['ts']) < _HOTLIST_LASTGOOD_TTL:
            stale = dict(good['data'])
            stale['stale'] = True
            # 兜底缓存的抓取时刻（good['ts']）= 真实数据抓取时间
            stale['fetchedAt'] = int(good['ts'])
            return jsonify(stale)
        return jsonify({'items': [], 'updatedAt': '', 'source': 'error',
                        'message': '上游数据源暂时不可用或限流，请稍后重试'})
    data = _cached(
        cache_key,
        ttl,
        lambda: _fetch_hotlist(src, limit, provider, ukey),
    )
    # 成功：记录 lastgood、清零失败计数，并原样返回
    if isinstance(data, dict) and data.get('source') != 'error':
        _hotlist_keep_good(src, limit, data)
        _hotlist_clear_fail(src, limit)
        out = dict(data)
        # 真实抓取时刻：优先缓存写入时刻（命中缓存即上次回源时刻），回落当前时刻
        out['fetchedAt'] = int(_CACHE_TS.get(cache_key, time.time()))
        return jsonify(out)
    # 双源皆失败：先标记冷却（停止持续打上游），再回退 lastgood（标注 stale）
    _hotlist_mark_fail(src, limit)
    good = _HOTLIST_LASTGOOD.get((src, limit))
    if good and (time.time() - good['ts']) < _HOTLIST_LASTGOOD_TTL:
        stale = dict(good['data'])
        stale['stale'] = True
        stale['fetchedAt'] = int(good['ts'])
        return jsonify(stale)
    return jsonify(data or {'items': [], 'updatedAt': '', 'source': 'error', 'message': '上游数据源暂时不可用或限流，请稍后重试'})

# ===========================================================================
# 6) 翻译代理 —— DeepSeek（OpenAI 兼容 chat/completions），外贸翻译专家 system prompt
#    POST /api/translate  {text, from, to, model, apiKey}
#    返回 {ok:True, text, model} 或 {ok:False, error}
#    受全局 CSRF 保护（前端拦截器自动带 X-CSRF-Token）；apiKey 由前端设置页传入（localStorage）。
# ===========================================================================
def _deepseek_err_hint(msg: str) -> str:
    """把 DeepSeek 返回的常见英文错误翻译成中文并附原文，便于用户定位。"""
    m = (msg or '').lower()
    if 'insufficient balance' in m or 'balance' in m:
        return 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试（原文：' + msg + '）'
    if 'rate limit' in m or 'too many' in m or 'quota' in m:
        return '请求过于频繁或额度受限，请稍后重试（原文：' + msg + '）'
    if ('invalid' in m or 'unauthorized' in m or 'authentication' in m) and ('key' in m or 'api_key' in m or 'token' in m):
        return 'DeepSeek API Key 无效或已过期，请在设置页检查（原文：' + msg + '）'
    return '翻译服务返回错误：' + msg


@bp.post('/translate')
def translate():
    """翻译代理（DeepSeek）。前端设置页填写的 API Key 经 body 传入（localStorage），
    经本路由转发，不写死在服务端；受全局 CSRF 保护。"""
    body = request.get_json(silent=True) or {}
    text = (body.get('text') or '').strip()
    if not text:
        return jsonify(ok=False, error='请输入要翻译的内容')
    api_key = (body.get('apiKey') or '').strip()
    if not api_key:
        return jsonify(ok=False, error='未配置 DeepSeek API Key，请在设置页填写')
    model = (body.get('model') or '').strip()
    if not model:
        # 不静默降级：用户显式选的模型（含 deepseek-flash 等新版）原样透传，由 DeepSeek 校验；
        # 若模型无效，DeepSeek 返回 4xx，前端按错误提示。仅在未选择时兜底为 deepseek-chat。
        model = 'deepseek-chat'
    from_lang = (body.get('from') or 'auto').strip()
    to_lang = (body.get('to') or 'en').strip()
    # 语言名（用于 system prompt 自然语言描述）
    lang_names = {
        'zh': '中文', 'en': '英文', 'ja': '日文', 'ko': '韩文', 'de': '德文',
        'fr': '法文', 'es': '西班牙文', 'ru': '俄文', 'auto': '源语言（自动识别）',
    }
    from_name = lang_names.get(from_lang, from_lang)
    to_name = lang_names.get(to_lang, to_lang)
    try:
        translated = _translate_deepseek(text, from_name, to_name, model, api_key, timeout=40)
    except urllib.error.HTTPError as e:
        detail = _http_err_body(e)
        if e.code == 401:
            return jsonify(ok=False, error='DeepSeek API Key 无效或已过期，请在设置页检查')
        try:
            err_obj = json.loads(detail)
            msg = (err_obj.get('error', {}) or {}).get('message') or detail
        except Exception:
            msg = detail
        return jsonify(ok=False, error=_deepseek_err_hint(msg))
    except urllib.error.URLError as e:
        return jsonify(ok=False, error='无法连接翻译服务（网络异常），请稍后重试')
    except Exception as e:
        return jsonify(ok=False, error='翻译失败：' + str(e)[:200])
    if not translated:
        return jsonify(ok=False, error='翻译结果为空，请重试')
    return jsonify(ok=True, text=translated, model=model)


# ===========================================================================
# 5) 工作台布局 / 偏好 / 数据 —— 按用户持久化（登录可见，PUT 受 CSRF 保护）
# ---------------------------------------------------------------------------
# 设计要点（对应「方案2：数据绑定账户」）：
#   - 服务端以「每用户一行」存整份 WbData JSON（核心为 instances 实例数组，可选 quote 全局字段），作为唯一真相源；
#     切换端口（5000↔5005）/ 换设备只要登录同一账号，数据即恢复。
#   - localStorage 降级为离线缓存，不再作为唯一来源。
#   - GET 免 CSRF（安全方法）；PUT 受全局 CSRFProtect 保护（前端拦截器自动带 X-CSRF-Token）。
#   - 未登录统一返回 401 JSON（与 app.unauthorized_handler 一致，前端据此判定登录态）。
# ===========================================================================
def _require_auth():
    """未登录返回 401 JSON；已登录返回 None。"""
    if not current_user.is_authenticated:
        return jsonify(status='error', msg='未登录'), 401
    return None


@bp.get('/workbench/state')
def workbench_state_get():
    denied = _require_auth()
    if denied is not None:
        return denied
    row = WorkbenchState.query.filter_by(user_id=current_user.id).first()
    # 无记录时返回 state=None，前端据此把本地非默认数据迁移上服务端（首次绑定）。
    state = json.loads(row.state) if row else None
    return jsonify(status='ok', state=state)


@bp.put('/workbench/state')
def workbench_state_put():
    denied = _require_auth()
    if denied is not None:
        return denied
    body = request.get_json(silent=True) or {}
    state = body.get('state')
    if not isinstance(state, dict):
        return jsonify(status='error', msg='state 字段缺失或不是对象'), 400
    # 白名单顶层键，避免存入无关的脏字段（前端只发 instances；quote 为可选全局字段）。
    clean = {k: state[k] for k in ('instances', 'quote') if k in state}
    now = datetime.utcnow()
    row = WorkbenchState.query.filter_by(user_id=current_user.id).first()
    if row is None:
        row = WorkbenchState(user_id=current_user.id, state='{}', updated_at=now)
        db.session.add(row)
    row.state = json.dumps(clean, ensure_ascii=False)
    row.updated_at = now
    db.session.commit()
    return jsonify(
        status='ok',
        state=clean,
        updated_at=now.strftime('%Y-%m-%d %H:%M:%S'),
    )
