#!/usr/bin/env bash
# 给「管理员」和「小菜菜」各造一份身体数据，验证 PK 对比；clear 时按备份还原
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE
MEMBER=o5bjc4oPISG_OF_uYwAtHx4n9JJ0
BACKUP=/opt/gym/testdata/pk-backup.json

case "${1:-set}" in
set)
  echo '=== 备份原值 ==='
  mkdir -p /opt/gym/testdata
  psql -tAc "select json_agg(json_build_object(
      'openid', openid, 'height', height, 'best_lift', best_lift,
      'sbd_total', sbd_total, 'latest_body', latest_body))
    from members where openid in ('$ADMIN','$MEMBER');" > "$BACKUP"
  python3 -c "import json;d=json.load(open('$BACKUP'));print('  备份 %d 个账号' % len(d))"

  echo '=== 写入演示数据 ==='
  psql -v ON_ERROR_STOP=1 <<SQL
-- 管理员：80kg / 体脂 22% / 肌肉率 45% / 评分 68 / 三项 80-110-130
update members set
  height = 175,
  best_lift = '{"bench":{"oneRM":80},"squat":{"oneRM":110},"deadlift":{"oneRM":130}}'::jsonb,
  sbd_total = 320,
  latest_body = jsonb_build_object(
    'weight', 80, 'height', 175, 'bodyFat', 22, 'muscle', 36, 'muscleRate', 45,
    'skeletalMuscle', 32, 'visceral', 8, 'bmi', 26.1, 'score', 68,
    'date', '2026-11-12', 'detail', '[]'::jsonb)
where openid = '$ADMIN';

-- 小菜菜：57.7kg / 体脂 26.4% / 肌肉率 69.5% / 评分 84 / 三项 30-50-60
update members set
  height = 158,
  best_lift = '{"bench":{"oneRM":30},"squat":{"oneRM":50},"deadlift":{"oneRM":60}}'::jsonb,
  sbd_total = 140,
  latest_body = jsonb_build_object(
    'weight', 57.7, 'height', 158, 'bodyFat', 26.4, 'muscle', 40.1, 'muscleRate', 69.5,
    'skeletalMuscle', 22.5, 'visceral', 7, 'bmi', 23.1, 'score', 84,
    'date', '2026-11-10', 'detail', '[]'::jsonb)
where openid = '$MEMBER';
SQL
  echo '=== 复核 ==='
  psql -c "select nick_name, height, sbd_total, latest_body->>'weight' as weight, latest_body->>'score' as score from members where openid in ('$ADMIN','$MEMBER');"
  ;;
clear)
  echo '=== 按备份还原 ==='
  if [ ! -s "$BACKUP" ]; then echo '  没有备份文件'; exit 1; fi
  python3 - "$BACKUP" <<'PY' > /tmp/pk-restore.sql
import json, sys
rows = json.load(open(sys.argv[1]))
def lit(v):
    return 'null' if v is None else "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
for r in rows:
    print("update members set height = %s, best_lift = %s, sbd_total = %s, latest_body = %s where openid = '%s';"
          % (r['height'] or 0, lit(r['best_lift']), r['sbd_total'] or 0, lit(r['latest_body']), r['openid']))
PY
  psql -v ON_ERROR_STOP=1 -f /tmp/pk-restore.sql 2>/dev/null || \
    docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -f /tmp/pk-restore.sql
  echo '=== 复核 ==='
  psql -c "select nick_name, height, sbd_total, coalesce(latest_body->>'weight','-') as weight from members where openid in ('$ADMIN','$MEMBER');"
  ;;
esac
