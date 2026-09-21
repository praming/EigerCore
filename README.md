# EigerCore · 个人效率工作台

> 以**工作台**为主，以**导航**为辅 —— 把你的效率工具与常用入口，收进同一处清爽的工作台。

EigerCore 是一个**个人效率工作台**（Personal Workbench）。它把日常高频使用的**小组件**（时钟、世界时间、待办、便签、日历、天气、自选股、招投标聚合、实用工具箱、倒计时、实时热搜、常用链接）集中在可拖拽排布的工作台网格上，让你打开页面就能组织一整天；其中**常用网站导航**作为工作台内的一个小组件存在，是顺手的补充，而非产品主体。

> 技术栈：Flask · Flask-SQLAlchemy · Flask-Login · Flask-WTF · SQLite · Vue 3 + Vite + TypeScript + Pinia · TailwindCSS（自定义设计系统）· SortableJS · Lucide Icons

---

## 核心定位

- **工作台优先**：首屏即工作台，所有效率组件自由增删、拖拽排序、独立配置、显隐自如。
- **导航为辅**：常用网址收纳为工作台内的「链接」组件，与效率组件并列排布，随手可达。
- **数据自持**：纯前端状态落盘本地，登录后自动同步到账户（服务端为唯一真相源），换设备不丢配置。

---

## 功能特性

### 工作台组件（主体）

| 组件 | 说明 |
| --- | --- |
| 时钟 / 世界时间 | 本地时间 + 多城市世界时钟；与北京不同日的城市以浅红高亮 |
| 待办 | 轻量任务清单，勾选即归档 |
| 便签 | 随手记录，支持农历与标题 |
| 日历 | 月历视图，标注今日 |
| 天气 | 实时天气，支持自定义城市与密钥 |
| 自选股 | 关注的股票行情速览 |
| 招投标聚合 | 多平台招投标信息一站式聚合 |
| 实用工具箱 | 翻译、计算等常用小工具 |
| 倒计时 | 重要日期倒数 |
| 实时热搜 | 各平台热搜榜聚合 |
| 常用链接（导航） | 收纳常用网址，即「导航为辅」的载体 |

### 账号与系统

| 能力 | 说明 |
| --- | --- |
| 账号体系 | 注册 / 登录 / 退出，基于 Flask-Login 的会话管理，未登录访问受保护页面自动跳转登录页 |
| 数据隔离 | 每个用户只能看到、操作**自己**的分组、链接与工作台实例 |
| 拖拽排序 | SortableJS 拖拽卡片，松手后顺序自动保存 |
| 图标系统 | 每张卡片用 **Lucide Icons** 渲染图标，表单中填写图标名即可 |
| 设置弹窗 | 主题配色 / 用户资料 / 系统设置（沿用统一设置入口） |
| 主题切换 | 一键切换深色 / 浅色，即时生效并持久化 |
| 自适应布局 | 移动优先，卡片网格随屏幕与「每行数量」设置自适应 |
| 安全 | Jinja2 自动转义防 XSS、密码哈希存储、CSRF 防护、越权拦截、主题白名单、头像 URL 校验 |

---

## 目录结构

```
EigerCore/
├── run.py                  # 启动入口（极简，调用 create_app 工厂）
├── init_db.py              # 数据库初始化脚本（生成 instance/links.db）
├── requirements.txt        # 依赖清单（已锁定版本）
├── README.md               # 本文件
├── app/
│   ├── __init__.py         # 应用工厂 create_app()（含 CSRF、主题上下文处理器）
│   ├── config.py           # 配置：SECRET_KEY / 数据库地址
│   ├── models.py           # 数据模型：User、Link、Group、UserSettings、WorkbenchState
│   ├── forms.py            # 表单：RegisterForm / LoginForm / LinkForm / GroupForm
│   ├── routes.py           # 蓝图 'main' 的全部路由与接口（含 JSON 协商）
│   ├── workbench_api.py    # 工作台状态读写接口
│   ├── templates/
│   │   ├── base.html       # 基础布局（顶栏 / 主题切换 / 视图切换 工作台·导航）
│   │   ├── login.html      # 登录页（工作台品牌介绍）
│   │   ├── register.html   # 注册页
│   │   └── dashboard.html  # 原 Jinja 仪表盘（导航视图，保留作兼容）
│   └── static/             # 自定义 css/js（含 input.css 设计系统）
├── web/                    # Vue 3 + Vite + TS 前端 SPA（工作台主体）
│   ├── src/components/workbench/  # 12 类工作台组件
│   ├── src/stores/workbench.ts     # 工作台状态（Pinia）
│   └── dist/               # 构建产物，Flask 直接托管
└── instance/
    └── links.db            # SQLite 数据库文件（首次 init 自动生成）
```

---

## 快速开始

要求 **Python 3.8+**（开发验证环境为 Python 3.13）。

```bash
# 1. 进入项目目录
cd EigerCore

# 2. （推荐）创建并激活虚拟环境
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS

# 3. 安装依赖
pip install -r requirements.txt

# 4. 初始化数据库（生成 instance/links.db 及表结构）
python init_db.py

# 5. 启动开发服务器
python run.py
```

浏览器访问 **http://127.0.0.1:5000** 即可使用。

### SPA 模式（Vue 3 单页应用，工作台主体）

前端 `web/` 是一个用 Vue 3 + Vite + TypeScript + Pinia 构建的单页应用（SPA），
即产品的**工作台主体**；构建产物由 Flask 直接托管，与原有 Jinja 接口共用同一套后端，可一键切换。

```bash
# 1. 构建前端（产物输出到 web/dist）
cd web && npm install && npm run build

# 2. 以 SPA 模式启动（等价于 USE_SPA=1 python run.py）
python serve_spa.py
```

- 访问 http://127.0.0.1:5000 即进入**工作台**；未登录会自动跳转到 `/login`（Jinja 登录页，登录后回到工作台）。
- 关闭 SPA：直接 `python run.py`（不设置 `USE_SPA`），回退到原 Jinja 仪表盘（导航视图），**零回归**。
- 通过环境变量 `USE_SPA=1/0` 控制开关；未构建 `web/dist` 时即使开启也会自动回退到 Jinja。

---

## 部署指南（安装 / 部署 / 备份 / 迁移）

> 适用对象：把 EigerCore 部署到一台干净的服务器 / 云主机 / 面板环境。
>
> **核心三步**：① 装 Python 依赖 → ② 初始化数据库（`instance/links.db`）→ ③ 以生产方式启动（gunicorn）并用 Nginx / 面板反代到 80/443。
>
> 工作台是 Vue 3 单页应用（SPA），需提前构建 `web/dist`。可在**本机构建后上传**，也可在**服务器上构建**（需 Node.js 18+）。

### 0. 前置条件

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Python | 3.8+（推荐 3.11 / 3.12） | 仅标准库 + Flask 全家桶 |
| pip | 随 Python 自带 | 安装 `requirements.txt` |
| Node.js | 18+（仅构建前端时需要） | 用 `npm run build` 生成 `web/dist` |
| 反向代理 | Nginx / 面板自带 Nginx | 把公网 80/443 转发到本地 5000 |
| 数据库 | 无需额外服务 | 默认 SQLite（单文件，已内置） |

> 生产 Web 服务器强烈建议用 **gunicorn**（性能好、可守护）。如未安装：`pip install gunicorn`。
> 开发自测可临时用 `python serve_spa.py`（Flask 自带服务器），但**不要用于生产**。

---

### 1. 安装（取代码 + 依赖 + 建库）

以下通用步骤**所有环境都要先执行**：

```bash
# 1) 获取代码（或从本机把整个目录上传到服务器）
git clone https://github.com/praming/EigerCore.git
cd EigerCore

# 2) 创建并激活虚拟环境（强烈建议，避免污染系统 Python）
python -m venv venv
source venv/bin/activate          # Linux / macOS
# venv\Scripts\activate           # Windows

# 3) 安装依赖
pip install -r requirements.txt

# 4) 初始化数据库（生成 instance/links.db 及表结构；已存在则增量迁移，不丢数据）
python init_db.py
```

**构建前端工作台（任选其一）**：

- **本机构建后上传（推荐、服务器最省事）**：在开发机执行 `cd web && npm install && npm run build`，把生成的整个 `web/dist` 目录上传到服务器对应 `web/dist`。
- **服务器上构建**：服务器装好 Node 18+ 后执行 `cd web && npm install && npm run build`。

> 只要 `web/dist/index.html` 存在，并以 `USE_SPA=1` 启动，访问站点即进入工作台；若 `web/dist` 缺失，会自动回退到原 Jinja 导航页（不会崩）。

---

### 2. 部署

无论哪种方式，生产启动的本质都是同一句：

```
USE_SPA=1 gunicorn -w 2 -b 127.0.0.1:5000 serve_spa:app
```

- `serve_spa:app`：模块 `serve_spa.py` 暴露的 Flask `app`（它内部已设 `USE_SPA=1`）。
- `-w 2`：2 个工作进程（SQLite 单文件足够；CPU 核多可加到 3~4）。
- `-b 127.0.0.1:5000`：只监听本机回环，由 Nginx / 面板反代对外。

#### 2.1 通用 / 裸机（systemd + gunicorn + Nginx）

**① 用 systemd 托管 gunicorn** —— 新建 `/etc/systemd/system/eigercore.service`：

```ini
[Unit]
Description=EigerCore Workbench
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/EigerCore
Environment=SECRET_KEY=换成一段足够随机的长字符串
Environment=USE_SPA=1
ExecStart=/opt/EigerCore/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 serve_spa:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now eigercore
sudo systemctl status eigercore      # 确认 active (running)
```

**② 配置 Nginx 反代** —— 新建 `/etc/nginx/conf.d/eigercore.conf`：

```nginx
server {
    listen 80;
    server_name your.domain.com;          # 改成你的域名
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> 如需在应用层正确拿到客户端真实 IP / 协议，可在 `app/__init__.py` 给 app 加 `from werkzeug.middleware.proxy_fix import ProxyFix; app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)`（详见 FAQ）。

**③ HTTPS**：用 Let's Encrypt 免费证书（`certbot --nginx`），或在面板 / CDN 处签发后回源 80。

#### 2.2 宝塔面板

1. **装软件**：「软件商店」安装 **Python 项目（Python 项目管理器）** 与 **Nginx**。
2. **建站点**：「网站 → 添加站点」，填域名，PHP 版本选「纯静态」（我们只在面板里借用它的 Nginx 反代）。
3. **部署 Python 项目**：「Python 项目 → 添加项目」：
   - 项目路径：`/www/wwwroot/EigerCore`（上传代码处）
   - Python 版本：选 3.8+
   - 框架：**Flask**
   - 启动文件：`serve_spa.py`
   - 启动命令：`gunicorn -w 2 -b 127.0.0.1:5000 serve_spa:app`
   - 端口：`5000`
   - 勾选「开机启动」
   - 「环境变量」里加：`SECRET_KEY=随机串`、`USE_SPA=1`
   - 保存并启动
4. **反代**：进该站点「设置 → 反向代理 → 添加反代」，目标 URL 填 `http://127.0.0.1:5000`，发送域名 `$host`；保存后访问域名即进入工作台。
5. **前端**：服务器「终端」进 `/www/wwwroot/EigerCore/web` 执行 `npm install && npm run build`（需先在系统里装好 Node 18+）；或直接把本机构建好的 `web/dist` 上传覆盖。
6. **HTTPS**：站点「SSL」申请证书并强制 HTTPS。

#### 2.3 1Panel 面板

1. **运行环境**：「网站 → 运行环境」创建 Python 运行环境（选 3.8+，面板自动装好 pip / gunicorn）。
2. **建站**：「网站 → 创建网站（Python）」：
   - 主目录：`/opt/EigerCore`（上传代码处）
   - 运行环境：选上一步创建的环境
   - 应用端口：`5000`
   - 启动文件 / 模块：`serve_spa:app`
   - 启动命令：`gunicorn -w 2 -b 0.0.0.0:5000 serve_spa:app`
   - 高级设置加环境变量：`SECRET_KEY=随机串`、`USE_SPA=1`
   - 确认创建并启动（1Panel 会自动生成 Nginx 反代）
3. **前端**：「终端」进 `web` 目录执行 `npm install && npm run build`；或上传本机构建好的 `web/dist`。
4. **HTTPS**：站点「证书」绑定并开启 HTTPS 强制跳转。

> 各面板 UI 文案随版本略有差异，但核心三要素一致：**启动模块 `serve_spa:app` + 端口 `5000` + 环境变量 `USE_SPA=1` 与 `SECRET_KEY`**，再把 Nginx 反代到 `127.0.0.1:5000`。

#### 2.4 Docker（一键 / 可复现，推荐）

EigerCore 官方提供 Docker 镜像，**单容器 + 一个数据卷**即可运行，无需额外数据库：

1. **用 compose（推荐）**：把下方内容存为 `docker-compose.yml`，执行 `docker compose up -d` 即自动从 GitHub 仓库拉取并构建镜像、启动服务。
   ```yaml
   services:
     nav:
       image: praming/eigercore:latest
       container_name: eigercore
       restart: unless-stopped
       ports:
         - "127.0.0.1:5000:5000"   # 仅本机回环；由宿主 Nginx / 宝塔 / 1Panel 反代到 80/443
       volumes:
         - nav-instance:/app/instance
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:5000/"]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 20s
   volumes:
     nav-instance:
   ```
2. **直接用镜像**：`docker run -d --name eigercore -p 5000:5000 -v eigercore-data:/app/instance praming/eigercore:latest`。
3. 启动后访问 `http://<宿主机>:5000`，**第一个注册账号自动成为管理员**。

> 镜像默认内置 SQLite，所有可变数据（数据库、会话密钥、上传图标）均落在容器卷 `/app/instance`。**备份该卷即可完成备份与迁移，无需任何 `.env` 文件**；升级只需 `docker compose up -d --build` 重建镜像，数据不丢。
> 将示例中的 `praming` 替换为你的 Docker Hub 用户名；锁定版本可用 `praming/eigercore:1.0.0` 之类的具体 tag。

---

### 3. 备份

备份只需三类文件（全部位于项目目录内）：

| 内容 | 路径 | 说明 |
| --- | --- | --- |
| 数据库 | `instance/links.db` | 全部账号、链接、分组、工作台配置（SQLite 单文件，复制即备份） |
| 前端产物 | `web/dist/` | SPA 构建结果；保留源码可不备份，重建即可 |
| 配置 / 密钥 | `.env` 或环境变量 / `app/config.py` | `SECRET_KEY`、数据库路径等；**务必单独安全保存 SECRET_KEY** |

**每日自动全量备份脚本（示例 `backup.sh`）**：

```bash
#!/bin/bash
set -e
SRC=/opt/EigerCore
BAK=/backup/eigercore/$(date +%F)
mkdir -p "$BAK"
# SQLite 单文件；停服再拷可 100% 避免写一半，不停服直接拷通常也安全
cp "$SRC/instance/links.db" "$BAK/links.db"
cp -r "$SRC/web/dist"       "$BAK/dist"
chmod -R 600 "$BAK"
echo "backup done: $BAK"
```

加入定时任务：

```bash
# crontab -e
0 3 * * * /opt/EigerCore/backup.sh >> /var/log/eigercore-backup.log 2>&1
```

> **安全提示**：`links.db` 含密码哈希与所有个人数据，备份文件请放在非公开目录并收紧权限（`chmod 600`），不要随代码库提交。

---

### 4. 迁移（换服务器 / 升级 / 数据搬家）

**场景 A：整机迁移（换服务器，保留全部数据）**

1. 旧服务器：按「3. 备份」打包 `instance/links.db` + `web/dist`，并记录 `SECRET_KEY`、Python / Node 版本。
2. 新服务器：执行「1. 安装」完成依赖与目录结构；把备份的 `instance/links.db` 放回 `instance/`，`web/dist` 放回 `web/`。
3. 用**相同 `SECRET_KEY`** 启动（否则已有会话 / CSRF 令牌全部失效，用户需重新登录——数据本身不丢）。
4. 按「2. 部署」任一方式启动 + 反代。

**场景 B：版本升级（拉取新代码）**

```bash
cd /opt/EigerCore
git pull
source venv/bin/activate
pip install -r requirements.txt        # 如有新增依赖
python init_db.py                      # 增量迁移，补齐新表/列，不丢数据
cd web && npm install && npm run build # 重建前端
# 重启服务：systemd → systemctl restart eigercore；面板 → 在面板点重启
```

**场景 C：从 SQLite 换数据库（可选）**

默认 SQLite 已满足个人使用。如需换 Postgres / MySQL，修改 `app/config.py` 的 `SQLALCHEMY_DATABASE_URI` 并执行 `python init_db.py` 重新建表，再用数据库自带工具把数据导入（如 `sqlite3 ... .dump` 后适配 SQL，或用 ETL 工具）。

---

### 5. 部署常见问题

- **502 / 站点打不开**：先 `curl 127.0.0.1:5000` 确认 gunicorn 在跑；再看 Nginx 反代目标是否为 `127.0.0.1:5000`；检查 `SECRET_KEY` / `USE_SPA` 是否注入。
- **工作台白屏但 `/login` 正常**：多半是 `web/dist` 没构建或路径不对；确认 `web/dist/index.html` 存在，且以 `USE_SPA=1` 启动。
- **改了代码不生效**：gunicorn 需重启（`systemctl restart` / 面板重启）；SPA 改动需重新 `npm run build`。
- **忘记 `SECRET_KEY`**：可重置，但所有用户会话会失效、需重新登录；数据不受影响。

---

## 使用说明

1. **注册 / 登录**：首次打开会跳转到登录页，点击「去注册」创建账号；登录后进入**工作台**。
2. **工作台布局**：顶栏在「工作台视图」下提供「组件库」入口，逐类罗列 12 种组件，可添加 / 隐藏 / 重命名 / 设置 / 删除；编辑模式下网格卡片支持拖拽排序、调整尺寸、点齿轮进入设置。
3. **导航（常用链接）**：「常用链接」组件即导航载体，在设置中维护网址分组与卡片；也可通过顶栏切换到「导航视图」查看原分组式导航墙。
4. **新增链接**：在「常用链接」组件设置中点击新增，填写标题、URL、图标与分组即可。
5. **拖拽排序**：直接拖动卡片调整顺序，松手后顺序自动保存。
6. **编辑 / 删除**：卡片右下角提供「编辑」「删除」按钮；删除会弹二次确认。
7. **设置**：点击右上角「设置」图标打开弹窗：主题 / 配色即时切换；用户资料设置昵称与头像；系统设置调整每行数量与登录保持天数。
8. **深色 / 浅色切换**：点击右上角太阳 / 月亮按钮一键切换（即时保存）。

---

## 工作台（Workbench）与小组件库

工作台是产品的**主体视图**（顶栏默认进入），定位为**个人效率一览**：时钟、天气、日历、待办、记事、自选股、工具箱、倒计时、招标信息、常用链接（导航）、实时热搜、世界时间共 12 类**小组件**，以网格卡片形式自由排布。

### 数据模型：每卡片 = 一个「组件实例」

后端按账户持久化的核心结构为**实例数组** `instances`：

```ts
interface WidgetInstance {
  iid: string                    // 实例唯一 ID（如 w_weather_8f3a）
  type: CardId                   // 组件类型（见下方 12 种）
  title?: string                 // 自定义标题（留空回退默认名）
  hidden: boolean                // 是否隐藏（仅前端不渲染，不清数据）
  showTitle: boolean             // 是否显示卡片标题栏
  autoHeight: boolean            // 满宽卡片是否按内容自适应高度
  size: { w: number; h: number } // 网格占位（w=列跨度 1~9，h=行跨度 1~5）
  config: Record<string, any>    // 该实例的私有配置（数据隔离的关键）
}
```

- **同类组件可添加多次**：例如添加多个「天气」实例，每个实例的 `config`（城市、API Key、刷新策略等）相互独立，互不影响。
- **隐藏 ≠ 删除**：隐藏仅把 `hidden` 置 true，前端不再渲染该卡片，**用户数据（config）原样保留**，可随时取消隐藏恢复显示。
- **删除会清空数据**：从组件库删除某实例会将其从 `instances` 中移除，该实例的 config 一并丢失；之后重新添加同类型组件会创建一个**全新的默认实例**（需重新在设置页自定义）。

### 小组件库（管理入口）

顶栏在**工作台视图下**会显示一个「组件库」按钮（网格图标）。点击打开**小组件库弹窗**，逐类罗列全部 12 种组件：

1. **添加**：每个组件类型右侧的「+ 添加」按钮，新增一个独立实例（默认配置、数据隔离）。
2. **显示 / 隐藏**：每行右侧的开关控制该实例是否在前端显示；关闭即隐藏，数据保留。
3. **重命名**：铅笔图标可内联修改实例标题（留空回退默认名）。
4. **设置**：齿轮图标打开该实例的设置弹窗（城市、刷新、字号、持仓等），与卡片设置一致。
5. **删除**：垃圾桶图标，两步确认（先点删除、再点出现的「确认」）后移除实例。

> 编辑模式（顶栏铅笔图标）下，工作台网格卡片也支持拖拽排序、调整尺寸、点齿轮进入设置。

### 账户级同步

工作台状态通过 `GET/PUT /api/workbench/state` 按登录账户持久化（后端白名单仅持久化 `instances` 顶层键，JSON 透传存储）；切换端口 / 设备只要登录同一账号即可恢复布局与数据；未登录仅以 localStorage 作离线缓存。

---

## 导航（常用链接）说明

「导航」是工作台中以「常用链接」组件形式存在的**辅助能力**，用于收纳高频网址；同时保留原 Jinja 仪表盘的「导航视图」作为兼容入口。其分组 / 链接的增删改、拖拽排序、图标系统均与工作台共享后端接口与 Lucide 图标规范。

### 图标系统（Lucide Icons）

本项目**统一使用 Lucide Icons**，不再依赖 FontAwesome。

- 卡片 / 按钮图标均通过 `<i data-lucide="图标名"></i>` 声明，页面加载时由 `lucide.createIcons()` 统一替换为内联 SVG。
- 后端 `Link.icon` 字段存储的是 **Lucide 图标名**（单个字符串，如 `globe`、`mail`、`youtube`），不再存储 `fa-xxx` 类名。
- 查找图标名：前往 **https://lucide.dev/icons** 搜索，复制图标名称填入即可。

### ⚠️ 常见注意事项
- **品牌图标限制**：Lucide 自 v1 起**移除了品牌 / Logo 类图标**（如 `github`、`twitter`、`youtube` 等早期存在过的名称可能已失效）。若需为某网站选图标，请改用通用图标，例如用 `globe`、`code`、`music`、`shopping-cart` 等中性图标代替。
- **旧数据迁移**：若数据库中已存有 FontAwesome 类名（如 `fa-solid fa-link`），它们不是合法的 Lucide 名，将不会渲染图标。可进入「编辑」重新填写 Lucide 名，或执行脚本批量清空 `icon` 字段以使用默认 `link` 图标。

---

## 配置

配置集中在 `app/config.py` 的 `Config` 类：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `SECRET_KEY` | `dev-secret-key-change-me` | 会话签名 / CSRF 令牌密钥。**生产环境务必通过环境变量覆盖** |
| `SQLALCHEMY_DATABASE_URI` | `sqlite:///<项目>/instance/links.db` | 数据库文件路径，一般无需修改 |
| `SQLALCHEMY_TRACK_MODIFICATIONS` | `False` | 关闭旧版事件追踪，消除警告、提升性能 |

设置生产密钥示例：
```bash
# Windows (PowerShell)
$env:SECRET_KEY = "一串足够随机的长字符串"
# Linux / macOS
export SECRET_KEY="一串足够随机的长字符串"
```

---

## 路由 / 接口参考

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/` | 已登录进入**工作台（SPA）**，否则跳 `/login` | 否 |
| GET/POST | `/register` | 注册 | 否 |
| GET/POST | `/login` | 登录 | 否 |
| GET | `/logout` | 退出登录 | 是 |
| GET | `/dashboard` | 原 Jinja 仪表盘（导航视图，兼容保留）；支持 `?group=<id>` 按分组筛选 | 是 |
| POST | `/link/add` | 新增链接（含可选 `group_id`） | 是 |
| POST | `/link/<id>/edit` | 编辑链接（含所有权校验） | 是 |
| POST | `/link/<id>/delete` | 删除链接（含所有权校验） | 是 |
| POST | `/update-order` | 拖拽排序：接收 `{"order": [id1, id2, ...]}`，批量更新 `sort_order` | 是 |
| POST | `/group/add` | 新增分组 | 是 |
| POST | `/group/<id>/edit` | 编辑分组（含所有权校验） | 是 |
| POST | `/group/<id>/delete` | 删除分组（其链接移至「未分组」，含所有权校验） | 是 |
| POST | `/settings/theme` | 设置主题配色（JSON：`{"theme": "dark"}`） | 是 |
| POST | `/settings/profile` | 设置用户资料（JSON：`{"nickname": "...", "avatar": "https://..."}`） | 是 |
| POST | `/settings/system` | 设置系统项（JSON：`{"links_per_row": 4, "session_days": 7}`） | 是 |
| GET/PUT | `/api/workbench/state` | 工作台状态（实例数组 `instances`）按账户读写；PUT 受 CSRF 保护，白名单仅持久化 `instances` 顶层键 | 是 |

`/update-order` 行为细节：
- 请求体为 JSON：`{ "order": [3, 1, 5, 2] }`，数组元素为链接 `id`，按期望的新顺序排列。
- 后端遍历数组，将每个 `id` 对应的 `sort_order` 设为 `下标 + 1`；**只更新属于当前用户且真实存在的链接**，忽略非法 / 他人 `id`（越权防护）。
- 成功返回 `{"status": "ok"}`；`order` 非列表时返回 `400`。

---

## 安全说明

- **XSS 防护**：所有用户输入经 Jinja2 `{{ }}` 自动转义输出；项目刻意**不使用 `| safe` 过滤器**（它会关闭转义，反而引入漏洞）。
- **密码安全**：密码以 `werkzeug.security.generate_password_hash` 哈希存储，永不保存明文。
- **CSRF 防护（全局）**：通过 `flask_wtf.CSRFProtect` 在 `app/__init__.py` 全局启用，覆盖**所有** POST/PUT/DELETE/PATCH 请求。
  - 表单（登录 / 注册 / 增 / 改 / 删）：模板渲染 `{{ form.csrf_token }}` 字段随表单提交；
  - 拖拽排序接口 `/update-order` 走 JSON + `fetch`：`base.html` 注入 `<meta name="csrf-token" content="...">`，`dashboard.html` 的 fetch 自动带上 `X-CSRFToken` 请求头。缺少令牌的请求会被拒绝（返回 400）。
- **越权防护**：编辑 / 删除 / 排序 / 分组 / 设置均校验资源归属当前用户，非法访问返回 `403` / `404`。
- **登录失败不区分原因**：统一提示「用户名或密码错误」，避免被用于撞库。
- **登录保持天数**：登录时读取用户设置中的 `session_days`，作为 `login_user(remember=True, duration=...)` 的有效期。修改后下次登录生效。
- **主题白名单**：`/settings/theme` 仅接受预置主题名，拒绝任意字符串写入 `data-theme`，防止属性注入。
- **头像 URL 校验**：`/settings/profile` 的头像字段仅允许为空或以 `http://`、`https://` 开头，拒绝 `javascript:` 等伪协议，避免注入。

---

## 开发与维护

- **应用工厂模式**：`app/__init__.py` 的 `create_app()` 负责装配 Flask、数据库、登录管理器并注册蓝图，便于测试与多配置扩展。
- **蓝图结构**：所有路由位于 `app/routes.py` 的 `Blueprint('main', __name__)`，后续可按业务拆分为 `api`、`admin` 等多个蓝图。
- **数据库变更**：`init_db.py` 现已支持**增量迁移**——对已有数据库会自动 `ALTER TABLE` 补齐新增列，并为存量用户补建默认数据，不会丢失已有数据；对全新数据库则直接 `create_all` 建表。开发期也可直接删除 `instance/links.db` 后重新运行 `python init_db.py`。
- **前端资源**：`web/` 为本地构建的 Vue 3 SPA；设计系统手写于 `app/static/src/input.css`（非 daisyUI），经 `web/src/style.css` 接入。
- **本 README 随项目同步维护**：任何结构、路由或配置的变更，请同步更新本文档对应章节，并保持「工作台为主、导航为辅」的口径。

---

## 常见问题 (FAQ)

**Q：工作台和导航是什么关系？**
A：工作台是产品主体，打开即见；导航是工作台内的「常用链接」组件，是辅助收纳网址的能力，也可通过顶栏切换到独立的「导航视图」（原 Jinja 仪表盘）。

**Q：图标不显示？**
A：确认填写的是合法的 Lucide 图标名（参见 lucide.dev/icons），且不含 `fa-` 前缀；品牌类图标（github 等）在 Lucide 中通常不可用，请换通用图标。

**Q：拖拽后顺序没保存？**
A：打开浏览器控制台（F12）查看保存日志；确认已登录且接口返回 `ok`。

**Q：如何重置数据？**
A：停止服务后删除 `instance/links.db`，重新运行 `python init_db.py`。

**Q：主题 / 每行数量在哪里设置？**
A：点击右上角「设置」图标打开弹窗：主题配色在「主题 / 配色」区点击切换；每行数量在「系统设置」区选择。

**Q：登录保持天数是怎么生效的？**
A：在「设置 → 系统设置」中填写 1~365 之间的天数，下次登录起，"记住我" cookie 的有效期即为该天数；旧会话不受影响，需重新登录应用新值。
