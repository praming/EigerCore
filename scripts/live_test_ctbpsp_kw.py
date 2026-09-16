import json, urllib.parse, urllib.request, time

# 模拟前端序列化后发出的「用户自定义关键词」ctbpsp 源
src = [{
    "type": "browser",
    "url": "https://ctbpsp.com/",
    "name": "中招公共服务平台（ctbpsp）",
    "keywords": ["布带", "吸丝带"],          # 用户的自定义关键词
    "fetchBody": False,
    "searchUrl": "",
    "apiUrl": "",
    "itemPath": "",
    "fields": {},
    "warmupUrl": "https://ctbpsp.com/",
    "itemSelector": "div.left_body",
    "titleSelector": "p.left_body_name",
    "linkSelector": "",
    "summarySelector": "span.btncas",
    "dateRegex": r"接收时间[:：]\s*(\d{4}-\d{2}-\d{2})",
    "baseUrl": "https://ctbpsp.com/",
    "maxItems": 30,
    "stealth": True,
    "channel": "msedge",
    "searchInputSelector": "input[type=\"text\"]",   # 驱动站点搜索框
    "searchButtonSelector": "button.btns",
    "searchFullTextToggleSelector": ".el-switch.switchStyle",  # 切到「搜全文」模式（OFF 化一次）
}]
params = urllib.parse.urlencode({"refresh": "1", "sources": json.dumps(src, ensure_ascii=False)})
url = "http://127.0.0.1:5000/api/bidding?" + params
t0 = time.time()
req = urllib.request.Request(url, headers={"_wants_json": "1"})
try:
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.loads(r.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, "耗时 %.1fs" % (time.time() - t0))
    print(e.read().decode("utf-8", "ignore")[:1500])
    raise SystemExit

print("HTTP 200  耗时 %.1fs  条目总数=%d" % (time.time() - t0, len(data)))
# 检查是否真的命中用户关键词
hits = [i for i in data if any(k in (i.get("title") or "") or k in (i.get("summary") or "") for k in ["布带", "吸丝带"])]
print("其中命中[布带/吸丝带]的条数=%d" % len(hits))
for i in data[:12]:
    print(" -", i.get("publishedAt"), "|", i.get("title"))
