#!/usr/bin/env bash
# 查看当前角色分布，确认「前台」已被迁移
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo "=== 角色分布 ==="
psql -c "select role, count(*) from members group by role order by role;"
echo "=== 账号明细 ==="
psql -c "select openid, nick_name, phone, role from members order by role, created_at;"
