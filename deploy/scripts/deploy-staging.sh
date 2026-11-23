#!/usr/bin/env bash
# 起测试环境（体验版 / 开发版专用）：独立库 + 独立容器，端口 8081
set -uo pipefail
cd /opt/gym

echo '=== 准备测试环境密钥 ==='
if ! grep -q '^STAGING_ADMIN_PASSWORD=' .env; then
  NEWPW=$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 14)
  printf '\n# 测试环境（体验版）管理后台密码\nSTAGING_ADMIN_PASSWORD=%s\nSTAGING_PUBLIC_BASE_URL=https://gym.novrein.com/test-api\n' "$NEWPW" >> .env
  echo "  已生成 STAGING_ADMIN_PASSWORD=$NEWPW"
else
  echo '  STAGING_ADMIN_PASSWORD 已存在'
fi

mkdir -p backups-staging

echo '=== 构建并启动测试环境容器 ==='
docker compose -f docker-compose.staging.yml up -d --build 2>&1 | tail -6

echo '=== 等待就绪 ==='
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8081/api \
    -H 'content-type: application/json' -d '{"action":"systemStatus"}' || true)
  if [ "$CODE" = "200" ]; then echo "  测试服务已就绪（HTTP $CODE）"; break; fi
  sleep 2
done

echo '=== 容器状态 ==='
docker compose -f docker-compose.staging.yml ps
