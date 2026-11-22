#!/usr/bin/env bash
# 查看测试库友圈表结构与最近动态
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== moments 表结构 ==='
psql -c "\d moments" | head -30

echo '=== 最近 8 条动态 ==='
psql -c "select id, openid, type, left(content, 24) as content,
                jsonb_array_length(media::jsonb) as media_count,
                to_timestamp(created_at/1000) as created
           from moments order by created_at desc limit 8;"

echo '=== 最近动态的媒体明细 ==='
psql -c "select id, openid, type, created_at, media::text from moments order by created_at desc limit 3;"
