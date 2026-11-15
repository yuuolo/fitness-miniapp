#!/usr/bin/env bash
# 清理图表验证用的测试数据（保留原有账号与数据）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo "=== 清理前 ==="
psql -c "select role, count(*) from members group by role;"
psql -c "select count(*) as strength_records from strength_records;"

psql -q <<'SQL'
begin;
delete from strength_records;
delete from members where openid like 'chart-seed-%';
commit;
SQL

echo "=== 清理后 ==="
psql -c "select openid, nick_name, role from members order by role desc, created_at;"
psql -c "select count(*) as strength_records from strength_records;"
