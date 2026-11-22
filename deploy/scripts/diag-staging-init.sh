#!/usr/bin/env bash
# 诊断测试环境为什么显示「系统尚未初始化」
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)

echo '=== 测试库 config 表 ==='
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -c \
  "select key, left(value::text, 120) as value from config order by key;"

echo '=== 正式库 config 表（对比）==='
docker exec -e PGPASSWORD="$PW" gym-db-1 psql -U postgres -d gym -c \
  "select key, left(value::text, 120) as value from config order by key;"

echo '=== 测试服务最近日志 ==='
docker logs gym-server-staging-1 --tail 30 2>&1 | tail -15
