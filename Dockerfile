# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: 构建前端 (Node 22)
#   产出 web/dist（Vite 默认配置：root=构建目录, outDir=dist）
# ============================================================
FROM node:22-slim AS frontend
WORKDIR /build
# 先装依赖以利用 Docker 层缓存
COPY web/package.json web/package-lock.json ./
RUN npm ci
# 再拷源码并构建（产物输出到 /build/dist）
COPY web/ ./
RUN npm run build

# ============================================================
# Stage 2: 运行环境 (Python 3.13)
# ============================================================
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    USE_SPA=1 \
    PORT=5000

WORKDIR /app

# 基础工具：healthcheck 用 curl
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖（gunicorn 单独安装，保持仓库 requirements.txt 不变）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# 应用代码
COPY app/ ./app/
COPY run.py serve_spa.py init_db.py ./

# 前端构建产物（来自 Stage 1）
COPY --from=frontend /build/dist ./web/dist/

# SQLite 持久化（务必挂载卷，否则容器重建会清空书签！）
VOLUME ["/app/instance"]

EXPOSE 5000

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
