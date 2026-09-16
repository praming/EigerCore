"""
config.py —— 项目配置文件
============================
这里集中存放 Flask 应用的各项配置（密钥、数据库地址等）。
使用面向对象的方式（一个 Config 类）管理配置，方便以后扩展（如开发/生产环境分离）。
"""

import os


class Config:
    # ------------------------------------------------------------------
    # 1. SECRET_KEY：应用的"私钥"
    #    - 用途：给 Session（会话）签名、生成 CSRF 令牌、密码相关的安全运算。
    #    - 安全提醒：生产环境千万不要用下面的默认值！应通过环境变量注入随机字符串，例如：
    #        Windows (PowerShell):  $env:SECRET_KEY = "一串随机长字符串"
    #        Linux/macOS:           export SECRET_KEY="一串随机长字符串"
    # ------------------------------------------------------------------
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-me')

    # ------------------------------------------------------------------
    # 2. 数据库地址（SQLAlchemy 使用）
    #    - 我们使用 SQLite，数据库文件放在项目根目录的 instance/ 文件夹下，名为 links.db。
    #    - BASE_DIR 指向 python-nav 根目录（config.py 在 app/ 里，所以要向上退一级）。
    #    - 提前创建 instance 目录，避免首次写入数据库时因目录不存在而报错。
    # ------------------------------------------------------------------
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → python-nav/
    INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')                       # → python-nav/instance/
    os.makedirs(INSTANCE_DIR, exist_ok=True)                               # 目录不存在就创建

    # sqlite:/// 后面跟绝对路径，三个斜杠不能少
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(INSTANCE_DIR, 'links.db')

    # ------------------------------------------------------------------
    # 3. 关闭"模型修改事件追踪"
    #    Flask-SQLAlchemy 旧版本用它做信号通知，新版本已废弃，关闭可消除警告、提升性能。
    # ------------------------------------------------------------------
    SQLALCHEMY_TRACK_MODIFICATIONS = False
