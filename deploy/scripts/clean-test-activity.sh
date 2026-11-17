#!/usr/bin/env bash
# 精确删除自动化测试留下的那条运动记录（只删这一个 id）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ID='ar_o5bjc4qI1ME8eNUtWE09sLqOE4aE_2026-11-16_run_self'
echo "=== 删除前确认这条记录属于测试 ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select id, date, type, distance, duration, source from activity_records where id = '$ID';"
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "delete from activity_records where id = '$ID';"
echo "=== 剩余运动记录 ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select openid, date, type, source from activity_records order by date desc limit 5;"
