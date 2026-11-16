#!/usr/bin/env bash
# 恢复管理员的原始状态（latest_body 空、best_lift 空对象）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE

psql -v ON_ERROR_STOP=1 <<SQL
update members set latest_body = null, best_lift = '{}'::jsonb, sbd_total = 0, height = 175
where openid = '$ADMIN';
SQL
psql -c "select nick_name, height, best_lift::text, coalesce(latest_body::text,'null') as latest_body from members where openid='$ADMIN';"
