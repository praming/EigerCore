"""
__init__.py —— 应用工厂（Application Factory）
=============================================
把 Flask 实例、数据库、登录管理器的初始化都放到 create_app() 里，
好处：
  1. 测试时可以用不同配置创建多个 app 实例；
  2. 避免"在导入时就创建全局 app"带来的循环导入问题；
  3. 各模块（models / routes / forms）只需从本包导入，结构清晰。

目录关系：
  app/
    __init__.py  ← 本文件，提供 create_app()
    config.py    ← 配置类
    models.py    ← db = SQLAlchemy() 与模型
    routes.py    ← bp = Blueprint('main', __name__)
    forms.py     ← 表单类
"""

from flask import Flask, request, jsonify, redirect, url_for, send_file
from flask_login import LoginManager, current_user
from flask_wtf import CSRFProtect

from .config import Config
from .models import db, User, UserSettings, SiteSettings

# 在模块级别创建 LoginManager / CSRFProtect 实例（具体的 init_app 在工厂里做）。
# 必须放在 `from .routes import bp` 之前：routes.py 在模块加载期即 `from . import csrf`，
# 此刻 csrf 必须已定义，否则会触发循环导入式 ImportError。
login_manager = LoginManager()
csrf = CSRFProtect()

from .routes import bp


def create_app(config_class=Config):
    """应用工厂：创建并配置好一个 Flask 应用后返回。"""

    # instance_relative_config=True 让 instance 目录（存放 links.db）相对于应用根目录
    app = Flask(__name__, instance_relative_config=True)
    # 从配置类加载设置（SECRET_KEY、SQLALCHEMY_DATABASE_URI 等）
    app.config.from_object(config_class)

    import os
    # 确保 instance 目录存在（首次运行还没有 instance/ 时会自动创建）
    os.makedirs(app.instance_path, exist_ok=True)

    # 1) 初始化数据库扩展
    db.init_app(app)

    # 2) 初始化登录管理器
    login_manager.login_view = 'main.login'                 # 未登录时跳转的视图
    login_manager.login_message = '请先登录后再访问该页面。'
    login_manager.login_message_category = 'error'         # flash 分类，方便前端用 Alert 样式
    login_manager.init_app(app)

    # 告诉 Flask-Login 如何根据用户 id 取出用户对象
    @login_manager.user_loader
    def load_user(user_id):
        # SQLAlchemy 2.0 推荐写法：db.session.get(模型, 主键)
        return db.session.get(User, int(user_id))

    # 3) 注册蓝图（所有路由都挂在 'main' 蓝图上）
    app.register_blueprint(bp)

    # 3.0) 工作台数据 API（天气/自选股/招标/名言）—— GET 只读，免登录、免 CSRF；
    #      返回 JSON 且失败时兜底占位数据，前端卡片永远有内容可渲染。
    from .workbench_api import bp as workbench_api_bp
    app.register_blueprint(workbench_api_bp)

    # 3.1) SPA 托管（Phase 5）：USE_SPA=1 且 web/dist/index.html 存在时，
    #      由 Flask 直接托管构建产物；关闭开关即回退到 Jinja 仪表盘（零交互回归）。
    #      已注册的静态路由（/api、/static、/login、/register、/data 等）优先级更高，
    #      此处仅兜底未匹配到的 GET，返回 SPA 入口以支持 createWebHistory 深链。
    import os as _os
    USE_SPA = _os.environ.get('USE_SPA', '').strip().lower() in ('1', 'true', 'yes', 'on')
    SPA_DIST = _os.path.join(config_class.BASE_DIR, 'web', 'dist')
    app.config['USE_SPA'] = USE_SPA
    app.config['SPA_DIST'] = SPA_DIST
    app.config['SPA_DIST_INDEX'] = _os.path.join(SPA_DIST, 'index.html')

    if USE_SPA and _os.path.isfile(app.config['SPA_DIST_INDEX']):
        @app.route('/assets/<path:filename>')
        def spa_assets(filename):
            from flask import send_from_directory
            return send_from_directory(_os.path.join(SPA_DIST, 'assets'), filename)

        @app.route('/<path:path>')
        def spa_catchall(path):
            if path.startswith(('api/', 'static/', 'data/')):
                return ('Not Found', 404)
            return send_file(app.config['SPA_DIST_INDEX'])

    # 4) 启用全局 CSRF 防护（表单与 AJAX 接口统一防护）
    csrf.init_app(app)

    # 4.1) 未授权处理器：/api/* 返回 401 JSON（供 SPA 判定登录态），
    #      其余请求仍重定向到登录页（保持 Jinja 页面行为不变）
    @login_manager.unauthorized_handler
    def unauthorized():
        if request.path.startswith('/api/'):
            return jsonify(status='error', msg='未登录'), 401
        return redirect(url_for('main.login'))

    # 5) 上下文处理器：把"当前用户激活的主题"注入所有模板，供 <html data-theme> 使用
    #    未登录或尚未设置时回退为 'light'。
    @app.context_processor
    def inject_ui_theme():
        theme = 'light'
        custom_theme = None
        allow_register = True
        if current_user.is_authenticated:
            s = UserSettings.query.filter_by(user_id=current_user.id).first()
            if s and s.theme:
                if s.theme.startswith('custom:'):
                    # 自定义配色：data-theme 设为 'custom'，并把颜色转为 HSL 注入 CSS 变量
                    theme = 'custom'
                    from .models import CustomTheme
                    from .utils import hex_to_hsl, on_color
                    cid = s.theme.split(':', 2)[1]
                    ct = CustomTheme.query.filter_by(id=cid, user_id=current_user.id).first()
                    if ct:
                        accent = ct.accent or '#f59e0b'
                        custom_theme = {
                            'p': hex_to_hsl(ct.primary),
                            's': hex_to_hsl(ct.secondary),
                            'b1': hex_to_hsl(ct.background),
                            'b2': hex_to_hsl(ct.background),
                            'bc': hex_to_hsl(ct.text),
                            'pc': on_color(ct.primary),
                            'a': hex_to_hsl(accent),
                            'af': hex_to_hsl(accent),
                        }
                    else:
                        theme = 'light'   # 配色不存在则回退
                else:
                    theme = s.theme
        # 站点级开关：是否开放注册（单例 id=1，不存在时回退为开放）
        ss = SiteSettings.query.get(1)
        allow_register = ss.allow_register if ss else True
        # 站点名称：注入所有模板，供顶栏品牌字、登录/注册页、标题等跟随「站点设置」变动
        site_name = (ss.site_name or 'Eiger') if ss else 'Eiger'
        return dict(ui_theme=theme, custom_theme=custom_theme, allow_register=allow_register, site_name=site_name)

    # 6) 资源版本号：把 main.css 的修改时间注入模板，作为静态链接的 ?v= 查询参数，
    #    强制浏览器在文件更新后重新拉取（避免旧 CSS 被长期缓存导致样式不生效）
    @app.context_processor
    def inject_asset_version():
        import os as _os
        css_path = _os.path.join(app.static_folder, 'css', 'main.css')
        try:
            ver = int(_os.path.getmtime(css_path))
        except OSError:
            ver = 0
        return dict(css_ver=ver)

    # 7) 当前视图模式：把 ?view= 注入模板，供顶部导航栏的高亮与切换链接使用
    @app.context_processor
    def inject_view():
        from flask import request
        return dict(current_view=request.args.get('view', 'nav'))

    # 8) 顶层分类：把分类列表与当前激活分类注入所有模板，供顶栏分类切换器渲染
    @app.context_processor
    def inject_categories():
        from .categories import ordered_categories, default_category
        return dict(categories=ordered_categories(), current_category=default_category())

    return app
