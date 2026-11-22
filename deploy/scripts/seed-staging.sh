#!/usr/bin/env bash
# 把正式库最新备份恢复到测试环境（让体验版有接近真实的数据可测）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
BACKUP=$(ls -t backups/gym-*.sql.gz 2>/dev/null | head -1)
if [ -z "$BACKUP" ]; then echo '没有找到备份文件'; exit 1; fi
echo "使用备份: $BACKUP（$(du -h "$BACKUP" | cut -f1)）"

echo '=== 暂停测试服务（避免连接占用）==='
docker compose -f docker-compose.staging.yml stop server-staging >/dev/null 2>&1 || true

echo '=== 重建 gym_staging 并恢复 ==='
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='gym_staging' and pid <> pg_backend_pid();" >/dev/null
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d postgres -c \
  "drop database if exists gym_staging;" -c "create database gym_staging;" 2>&1 | tail -2

gunzip -c "$BACKUP" | docker exec -i -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging 2>&1 | tail -4

echo '=== 启动测试服务 ==='
docker compose -f docker-compose.staging.yml start server-staging >/dev/null 2>&1
sleep 6

echo '=== 测试库数据概览 ==='
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -c "
select
  (select count(*) from members) as 会员,
  (select count(*) from body_records) as 体测,
  (select count(*) from strength_records) as 力量成绩,
  (select count(*) from moments) as 友圈,
  (select count(*) from competitions) as 竞赛,
  (select count(*) from challenges) as 挑战,
  (select count(*) from media) as 媒体文件;"

echo '=== 测试服务健康检查 ==='
curl -s -X POST http://127.0.0.1:8081/api -H 'content-type: application/json' \
  -d '{"action":"systemStatus"}' | head -c 200; echo
