#!/usr/bin/env bash
# 部署挑战功能后端到生产（schema 会随服务启动自动补表）
set -uo pipefail
cd /opt/gym
docker compose build server 2>&1 | tail -1
docker compose up -d --force-recreate server 2>&1 | tail -1
sleep 12
echo '=== 挑战表是否建好 ==='
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select table_name from information_schema.tables where table_name like 'challenge%' order by table_name;"
echo '=== members 新字段 ==='
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select column_name from information_schema.columns where table_name='members' and column_name like 'challenge%';"
echo '=== action 是否注册（日志里的 actions 列表）==='
docker compose logs server --since 2m 2>&1 | grep -o 'createChallenge' | head -1
