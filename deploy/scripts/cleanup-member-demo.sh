#!/usr/bin/env bash
# ⚠️ 这个脚本直接操作生产库 gym，执行前请确认
if [ "${ALLOW_PROD_WRITE:-}" != "1" ]; then
  echo "已拒绝执行：$0 直接操作生产库。确认请加 ALLOW_PROD_WRITE=1"
  exit 1
fi

# 把小菜菜的身体数据恢复到最初的干净状态（best_lift 空 / latest_body 空 / height 0）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
TARGET=o5bjc4oPISG_OF_uYwAtHx4n9JJ0

psql -v ON_ERROR_STOP=1 <<SQL
delete from body_records where openid='$TARGET';
delete from strength_records where openid='$TARGET' and operator='demo';
update members set best_lift = '{}'::jsonb, sbd_total = 0, latest_body = null, height = 0
where openid='$TARGET';
SQL

echo '=== 复核 ==='
psql -c "select nick_name, phone, height, best_lift::text, coalesce(latest_body::text,'null') as latest_body from members where openid='$TARGET';"
psql -tAc "select 'body_records=' || count(*) from body_records where openid='$TARGET';"
