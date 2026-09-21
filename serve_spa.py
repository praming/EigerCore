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
    # 仅当显式设置 FLASK_DEBUG=1 才开启调试模式；默认关闭，避免在生产中误用本脚本
    # 而被 Werkzeug 调试器远程代码执行（RCE）漏洞影响。生产请用 gunicorn（见 README / Dockerfile）。
    # 关闭 reloader：本环境下 reloader 父/子代理偶发 IPv4/IPv6 绑定失配，导致请求 502，
    # 故单进程更稳定；改文件后需手动重启本进程才能生效。
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug, use_reloader=False, host='127.0.0.1', port=5000)
