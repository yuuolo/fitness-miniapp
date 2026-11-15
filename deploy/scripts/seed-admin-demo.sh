#!/usr/bin/env bash
# 临时给管理员账号塞一份演示数据，用于验证雷达图渲染；验证后可一键还原
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE

ACTION=${1:-set}

if [ "$ACTION" = "set" ]; then
  echo '=== 备份原值 ==='
  psql -tAc "select coalesce(best_lift::text,'null') || '|' || coalesce(latest_body::text,'null') from members where openid='$ADMIN';" \
    > /tmp/admin-fitness-backup.txt
  cat /tmp/admin-fitness-backup.txt

  echo '=== 写入演示数据（80kg / 体脂 22% / 肌肉率 45% / 评分 68 / 卧推80 深蹲110 硬拉130）==='
  psql -v ON_ERROR_STOP=1 <<SQL
update members set
  height = 175,
  best_lift = '{"bench":80,"squat":110,"deadlift":130}'::jsonb,
  sbd_total = 320,
  latest_body = jsonb_build_object(
    'weight', 80, 'height', 175, 'bodyFat', 22, 'muscleRate', 45,
    'muscle', 36, 'visceral', 8, 'bmi', 26.1,
    'score', 68,
    'detail', '[{"key":"fat","label":"体脂率","score":28,"max":40}]'::jsonb
  )
where openid = '$ADMIN';
SQL
  echo '=== 当前值 ==='
  psql -tAc "select best_lift::text, latest_body::text from members where openid='$ADMIN';"
else
  echo '=== 还原 ==='
  ORIG=$(cat /tmp/admin-fitness-backup.txt)
  BEST=$(echo "$ORIG" | cut -d'|' -f1)
  BODY=$(echo "$ORIG" | cut -d'|' -f2)
  [ "$BEST" = "null" ] && BEST=null
  [ "$BODY" = "null" ] && BODY=null
  psql -v ON_ERROR_STOP=1 <<SQL
update members set
  best_lift = $( [ "$BEST" = "null" ] && echo "null" || echo "'$BEST'::jsonb" ),
  sbd_total = 0,
  latest_body = $( [ "$BODY" = "null" ] && echo "null" || echo "'$BODY'::jsonb" )
where openid = '$ADMIN';
SQL
  psql -tAc "select coalesce(best_lift::text,'null'), coalesce(latest_body::text,'null') from members where openid='$ADMIN';"
fi
