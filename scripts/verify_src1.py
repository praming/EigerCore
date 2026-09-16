"""临时验证脚本：用源1（中烟电子采购平台）配置真实抓取布带/吸丝带，确认命中。
直接 import 后端 workbench_api 的 _fetch_bidding，避免启动 Flask。
"""
import importlib.util
import os

ROOT = r"D:\wwwroot\workbuddy\python-nav"
spec = importlib.util.spec_from_file_location(
    "wbapi", os.path.join(ROOT, "app", "workbench_api.py")
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

sources = [
    {
        "url": "https://cgjy.tobacco.com.cn/",
        "keywords": ["布带", "吸丝带"],
        "searchUrl": "https://cgjy.tobacco.com.cn/search.jspx?q={kw}",
        "fetchBody": True,
    }
]

print("==> 抓取源1：烟草电子采购平台，关键词 布带/吸丝带")
hits = mod._fetch_bidding(sources)
print(f"TOTAL_HITS = {len(hits)}")
print("=" * 60)
for i, h in enumerate(hits, 1):
    print(f"[{i}] {h['title']}")
    print(f"    来源 : {h['source']}")
    print(f"    时间 : {h['publishedAt']}")
    print(f"    正文 : bodyAvailable={h['bodyAvailable']} 长度={len(h.get('body') or '')}")
    if h.get("body"):
        print(f"    摘要 : {h['body'][:80]}...")
    print(f"    链接 : {h['url']}")
    print("-" * 60)
