#!/usr/bin/env bash
# 验证测试环境与正式环境已隔离
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)

echo '=== 正式库 ==='
docker exec -e PGPASSWORD="$PW" gym-db-1 psql -U postgres -d gym -tAc "
select '会员=' || (select count(*) from members) ||
       ' 体测=' || (select count(*) from body_records) ||
       ' 力量=' || (select count(*) from strength_records) ||
       ' 友圈=' || (select count(*) from moments) ||
       ' 竞赛=' || (select count(*) from competitions) ||
       ' 挑战=' || (select count(*) from challenges) ||
       ' 媒体=' || (select count(*) from media);"

echo '=== 测试库 ==='
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -tAc "
select '会员=' || (select count(*) from members) ||
       ' 体测=' || (select count(*) from body_records) ||
       ' 力量=' || (select count(*) from strength_records) ||
       ' 友圈=' || (select count(*) from moments) ||
       ' 竞赛=' || (select count(*) from competitions) ||
       ' 挑战=' || (select count(*) from challenges) ||
       ' 媒体=' || (select count(*) from media);"

echo '=== 两个库不是同一个实例 ==='
echo -n '正式库容器: '; docker exec gym-db-1 psql -U postgres -d gym -tAc "select 'db=' || current_database() || ' server=' || inet_server_addr() || ':' || inet_server_port();" 2>/dev/null | tr -d '\r'
echo -n '测试库容器: '; docker exec gym-db-staging-1 psql -U postgres -d gym_staging -tAc "select 'db=' || current_database();" 2>/dev/null | tr -d '\r'

echo '=== 测试环境通知开关 ==='
docker inspect gym-server-staging-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'NOTIFY_DISABLED|PUBLIC_BASE_URL'
