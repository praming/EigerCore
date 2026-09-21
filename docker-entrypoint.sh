#!/bin/sh
set -e

# SECRET_KEY：
#   - 若已在环境变量中提供（compose 显式传入），直接使用；
#   - 否则从 /app/instance/secret_key 读取；文件不存在则自动生成并持久化。
# → 密钥随卷备份，容器重建 / 迁移仅需备份 /app/instance，无需任何 .env 文件。
SECRET_FILE=/app/instance/secret_key
if [ -z "$SECRET_KEY" ]; then
  if [ ! -f "$SECRET_FILE" ]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    python -c "import secrets;open('$SECRET_FILE','w').write(secrets.token_hex(32))"
    chmod 600 "$SECRET_FILE"
  fi
  export SECRET_KEY=$(cat "$SECRET_FILE")
fi

# 用户上传的图标（app/static/uploads）也归入卷：软链到 /app/instance/uploads，
# 保证「备份 /app/instance = 全部可变数据与设置（DB + 密钥 + 上传文件）」。
mkdir -p /app/instance/uploads
if [ ! -L /app/app/static/uploads ]; then
  rm -rf /app/app/static/uploads
  ln -sfn /app/instance/uploads /app/app/static/uploads
fi

# 数据库幂等初始化：仅创建缺失的表、补齐缺失的列，已存在则跳过（可安全反复运行）
python init_db.py

# 生产服务：gunicorn 绑定容器全部网卡，由宿主 Nginx / 宝塔 / 1Panel 反代到 5000
exec gunicorn -w 2 -b 0.0.0.0:5000 --timeout 120 serve_spa:app
