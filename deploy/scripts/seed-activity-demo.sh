#!/usr/bin/env bash
# 给管理员造两条运动记录，验证「最近运动」展示；测完可删
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE
TODAY=$(TZ=Asia/Shanghai date +%F)

case "${1:-set}" in
set)
  psql -v ON_ERROR_STOP=1 <<SQL
delete from activity_records where openid = '$ADMIN' and operator = 'demo';
insert into activity_records (id, openid, date, type, steps, distance, duration, calories, avg_hr, source, operator, created_at)
values
  ('ar_demo_walk_$TODAY', '$ADMIN', '$TODAY', 'walk', 8600, 0, 45, 0, 0, 'staff', 'demo', $(date +%s000)),
  ('ar_demo_cycle_$TODAY', '$ADMIN', '$TODAY', 'cycling', 0, 22.4, 58, 420, 132, 'staff', 'demo', $(date +%s000));
SQL
  psql -c "select type, steps, distance, duration, calories, avg_hr from activity_records where operator='demo';"
  ;;
clear)
  psql -c "delete from activity_records where operator='demo';"
  ;;
esac
