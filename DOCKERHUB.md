# EigerCore · 个人效率工作台

**一个开箱即用的个人效率工作台 Docker 镜像** —— 把时钟、天气、日历、待办、便签、自选股、招投标聚合、实用工具箱、倒计时、实时热搜、常用链接（导航）等 12 类小组件，集中在可拖拽排布的工作台网格上。以工作台为主、导航为辅，数据自持、跨设备同步。

> 镜像内置 SQLite，单容器 + 一个数据卷即可运行，无需额外数据库。所有可变数据与设置都落在 `/app/instance`，备份它即完成迁移与重建。

---

## 快速开始

```bash
# 1) 直接用镜像（可复现：锁定 tag，如 praming/eigercore:1.0.0）
docker run -d --name eigercore -p 5000:5000 -v eigercore-data:/app/instance praming/eigercore:latest

# 2) 或用 docker compose（推荐，自动从 GitHub 仓库拉取最新构建）
#    把下面内容存为 docker-compose.yml 后执行：docker compose up -d
```

<details>
<summary>docker-compose.yml（点击展开）</summary>

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

</details>

启动后访问 `http://<宿主机>:5000`，首次打开跳转注册页，**第一个注册账号自动成为管理员**。

---

## 特性

- **工作台主体**：12 类小组件自由增删、拖拽排序、独立配置、显隐自如；同类组件可加多个（数据隔离）。
- **导航辅助**：常用网址收纳为工作台内「链接」组件，与效率组件并列。
- **账号与数据隔离**：每个用户仅见自己的分组、链接与工作台实例；登录后配置同步到服务端（唯一真相源），换设备不丢。
- **安全**：密码哈希存储、全局 CSRF 防护、越权拦截、主题白名单、头像 URL 校验、上传图标净化。
- **主题**：深色 / 浅色一键切换，自定义配色；自适应移动优先布局。
- **反向代理就绪**：内置 `ProxyFix`，部署在 Nginx / 宝塔 / 1Panel 之后自动识别真实 IP 与协议。

---

## 数据持久化

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 数据库 | `/app/instance/links.db` | 全部账号、链接、分组、设置（SQLite 单文件） |
| 会话密钥 | `/app/instance/secret_key` | 首次启动自动生成并持久化；无需任何 `.env` |
| 上传图标 | `/app/instance/uploads/` | 用户上传图标，软链自 `app/static/uploads` |

**备份 / 迁移**：停服后打包 `/app/instance` 目录（或 Docker 卷 `nav-instance`）即可；还原放回原处。`SECRET_KEY` 在卷内自动一致，重建/迁移无需重新登录。

---

## 环境变量（均可选）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SECRET_KEY` | 自动生成 | 生产可显式覆盖（写入 `/app/instance/secret_key`） |
| `USE_SPA` | `1` | 工作台 SPA 模式（镜像默认开启） |
| `PORT` | `5000` | 容器内监听端口 |

---

## 反代到公网（示例 Nginx）

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 源码与文档

- GitHub：https://github.com/praming/EigerCore
- 部署 / 备份 / 迁移完整说明见仓库 `README.md`。

## 许可证

仅供个人自托管使用。
