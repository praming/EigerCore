"""
serve_spa.py —— 以 SPA 模式启动（Flask 直接托管构建好的 web/dist）

前置步骤：先构建前端产物
    cd web && npm install && npm run build   # 产物输出到 web/dist/index.html

启动 SPA 模式：
    python serve_spa.py
    # 等价于在环境变量 USE_SPA=1 下运行 run.py
    # 浏览器访问 http://127.0.0.1:5000

关闭 SPA（回退到原 Jinja 仪表盘）：
    python run.py

说明：
    - 本脚本只是在 import run 之前注入 os.environ['USE_SPA']='1'，
      真正的 SPA 托管路由注册逻辑在 app/__init__.py 的 create_app() 内。
    - 未登录用户访问 / 会进入 web/dist/index.html（SPA 入口），
      由前端在 init() 完成后判定未登录再跳转 /login（仍是 Jinja 页面，
      登录成功后设置 session，随后回到 SPA）。
"""
import os

# 必须在 import run 之前设置，因为 create_app() 在导入期即读取该环境变量
os.environ.setdefault('USE_SPA', '1')

from run import app  # noqa: E402


if __name__ == '__main__':
    # debug=True 保留开发期错误页；但关闭 reloader —— 本环境下 reloader 父/子代理偶发
    # IPv4/IPv6 绑定失配，导致线上请求 502「upstream connect failed」，故用单进程更稳定。
    # 改文件后需手动重启本进程才能生效（不再自动重载）。
    app.run(debug=True, use_reloader=False, host='127.0.0.1', port=5000)
