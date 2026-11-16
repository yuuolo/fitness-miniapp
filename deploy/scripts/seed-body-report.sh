#!/usr/bin/env bash
# 临时给管理员塞一份带报告图的身体数据，验证报告图显示/放大/转发；clear 还原
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE
BACKUP=/opt/gym/testdata/admin-body-backup.json

case "${1:-set}" in
set)
  mkdir -p /opt/gym/testdata
  psql -tAc "select json_build_object('latest_body', latest_body, 'height', height, 'best_lift', best_lift, 'sbd_total', sbd_total)
               from members where openid='$ADMIN';" > "$BACKUP"
  echo '=== 原值 ==='; cat "$BACKUP"

  # 复制 Yu 的最新一条体测（含报告图）到管理员
  psql -v ON_ERROR_STOP=1 <<SQL
update members set
  height = 175,
  latest_body = (
    select jsonb_build_object(
      'weight', 71.2, 'height', 175, 'bodyFat', 18.5, 'muscle', 33.4, 'muscleRate', 46.9,
      'bmi', 23.2, 'visceral', 8, 'bodyAge', 32, 'bmr', 1650, 'fatFreeMass', 58.0,
      'score', 76, 'date', '2026-11-16', 'deviceName', '体测仪',
      'reportImage', 'https://gym.novrein.com/api/media/9c23dfbde22451c786ee875098f904f4',
      'detail', '[{"key":"fat","label":"体脂率","score":32,"max":40}]'::jsonb
    )
  )
where openid = '$ADMIN';
SQL
  psql -tAc "select latest_body->>'reportImage' from members where openid='$ADMIN';"
  ;;
clear)
  echo '=== 还原 ==='
  python3 - "$BACKUP" <<'PY' > /tmp/restore-admin-body.sql
import json, sys
d = json.load(open(sys.argv[1]))
def lit(v):
    return 'null' if v is None or v == {} else "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
print("update members set latest_body = %s, height = %s, best_lift = %s, sbd_total = %s where openid = 'o5bjc4qI1ME8eNUtWE09sLqOE4aE';"
      % (lit(d.get('latest_body')), d.get('height') or 0, lit(d.get('best_lift')), d.get('sbd_total') or 0))
PY
  cat /tmp/restore-admin-body.sql
  psql -v ON_ERROR_STOP=1 < /tmp/restore-admin-body.sql
  psql -tAc "select coalesce(latest_body::text,'null') from members where openid='$ADMIN';"
  ;;
esac
