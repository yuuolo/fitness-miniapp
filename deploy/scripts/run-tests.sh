#!/usr/bin/env bash
# 一键：本地 tar 已在 /tmp/deploy.tar.gz → 解压、重建镜像、跑集成测试
set -uo pipefail
cd /opt/gym
tar -xzf /tmp/deploy.tar.gz -C /opt/gym
chown -R gym:gym /opt/gym 2>/dev/null || true
chmod 600 /opt/gym/.env 2>/dev/null || true
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)

echo "=== 重建 server 镜像 ==="
docker compose build server 2>&1 | tail -2

echo "=== 准备测试库 gym_test ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists gym_test;" -c "create database gym_test;" 2>&1 | tail -2

echo "=== 运行测试 ==="
docker compose run --rm --no-deps \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym_test" \
  -e WX_APPID=test -e WX_SECRET=test \
  server node test/run.js 2>&1
echo "=== 测试退出码: ${PIPESTATUS[0]} ==="
