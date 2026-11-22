#!/usr/bin/env bash
# 重新部署测试环境（应用 NOTIFY_DISABLED 等新配置）+ 验证
set -uo pipefail
cd /opt/gym

echo '=== 重建测试容器 ==='
docker compose -f docker-compose.staging.yml up -d --build 2>&1 | tail -4
sleep 8

echo '=== 测试库数据（应为正式库快照）==='
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -tAc \
  "select '会员=' || (select count(*) from members) || ' 体测=' || (select count(*) from body_records) ||
          ' 友圈=' || (select count(*) from moments) || ' 媒体=' || (select count(*) from media);"

echo '=== 测试服务响应（缺 code 应报 400，说明服务正常）==='
curl -s -X POST http://127.0.0.1:8081/api -H 'content-type: application/json' \
  -d '{"action":"systemStatus"}' | head -c 120; echo

echo '=== 通知开关（测试环境应为 1）==='
docker exec gym-server-staging-1 sh -c 'echo NOTIFY_DISABLED=$NOTIFY_DISABLED'
