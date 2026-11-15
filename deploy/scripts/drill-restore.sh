#!/usr/bin/env bash
# 验证恢复脚本真的能恢复（在独立测试库上演练，不碰生产）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql_super() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres "$@"; }

echo '=== 1. 建一个演练库 gym_restore_drill ==='
psql_super -c "drop database if exists gym_restore_drill;" >/dev/null
psql_super -c "create database gym_restore_drill;" >/dev/null
docker compose exec -T -e PGPASSWORD="$PW" db sh -c "PGPASSWORD=$PW psql -U postgres -d gym_restore_drill -q -f /docker-entrypoint-initdb.d/01-schema.sql" >/dev/null 2>&1 || true

echo '=== 2. 用恢复脚本导入最近一份备份 ==='
BACKUP=$(docker compose exec -T server sh -c 'ls -1t /app/backups/app-*.jsonl.gz | head -1' | tr -d '\r\n')
echo "  备份文件：$BACKUP"
docker run --rm --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym_restore_drill" \
  -v /opt/gym/backups:/app/backups \
  gym-server node scripts/restore-app-backup.js "$BACKUP" 2>&1 | tail -12

echo
echo '=== 3. 检查演练库数据 ==='
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym_restore_drill -c \
  "select nick_name, phone, role from members order by role desc, created_at;"
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym_restore_drill -c \
  "select (select count(*) from moments) as moments, (select count(*) from media) as media, (select count(*) from lift_items) as lifts;"

echo
echo '=== 4. 清理演练库 ==='
psql_super -c "drop database if exists gym_restore_drill;" >/dev/null
echo '  已清理'
