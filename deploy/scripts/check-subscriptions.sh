#!/usr/bin/env bash
# 检查订阅票表 + 广播日志
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select count(*) as 订阅记录 from notify_subscriptions;"
echo '=== 服务日志里的通知记录（最近 10 分钟）==='
docker compose logs server --since 10m 2>&1 | grep -iE 'notify|subscribeMessage' | tail -8 || echo '（无）'
