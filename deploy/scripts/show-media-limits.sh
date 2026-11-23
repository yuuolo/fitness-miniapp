#!/usr/bin/env bash
# 查看两端的上传限制配置
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
echo '=== 测试库 mediaLimits ==='
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -tAc \
  "select value::text from config where key = 'mediaLimits';"
echo '=== 正式库 mediaLimits ==='
docker exec -e PGPASSWORD="$PW" gym-db-1 psql -U postgres -d gym -tAc \
  "select value::text from config where key = 'mediaLimits';"
