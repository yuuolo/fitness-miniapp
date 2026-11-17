#!/usr/bin/env bash
# 清理测试产生的视频文件
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select id, mime, round(length(bytes)/1048576.0, 2) as mb from media where mime like 'video/%' order by created_at desc limit 10;"
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "delete from media where mime like 'video/%' and created_at > (extract(epoch from now())*1000 - 3600000);"
