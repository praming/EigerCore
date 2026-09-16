"""
run.py —— 项目启动入口
========================
只负责"创建 app 并启动开发服务器"。真正的初始化逻辑都在 app/__init__.py
的 create_app() 工厂里，这里保持极简。

运行方式：
    python run.py
然后访问 http://127.0.0.1:5000
"""

from app import create_app

# 调用工厂函数创建应用实例
app = create_app()

if __name__ == '__main__':
    # debug=True 方便开发时自动重载、报错页详细；生产环境务必关闭
    app.run(debug=True)
