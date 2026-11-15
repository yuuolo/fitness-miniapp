#!/usr/bin/env bash
# 临时给「小菜菜」造两条体测记录 + 最新身体数据，用于验证会员资料页；跑完可还原
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
TARGET=o5bjc4oPISG_OF_uYwAtHx4n9JJ0   # 小菜菜

case "${1:-set}" in
set)
  echo '=== 备份原值 ==='
  psql -tAc "select coalesce(best_lift::text,'null') || '|' || coalesce(latest_body::text,'null') || '|' || height from members where openid='$TARGET';" > /tmp/xiaocaicai-backup.txt
  cat /tmp/xiaocaicai-backup.txt
  psql -tAc "select count(*) from body_records where openid='$TARGET';" > /tmp/xiaocaicai-bodycount.txt
  echo "原有体测记录: $(cat /tmp/xiaocaicai-bodycount.txt)"

  echo '=== 写入 2 条体测 + 最新数据 ==='
  psql -v ON_ERROR_STOP=1 <<SQL
delete from body_records where openid='$TARGET';
insert into body_records (id, openid, date, measured_at, weight, height, bmi, gender, score, detail, source, operator, created_at)
values
  ('demo_body_1', '$TARGET', '2026-10-20', 1760000000000, 58.6, 158, 23.5, 'female', 80, '[]'::jsonb, 'staff', 'demo', 1760000000000),
  ('demo_body_2', '$TARGET', '2026-11-10', 1762000000000, 57.7, 158, 23.1, 'female', 84, '[]'::jsonb, 'staff', 'demo', 1762000000000);

update body_records set
  body_fat = 26.4, muscle = 40.1, muscle_rate = 69.5, water = 31.5, water_rate = 54.6,
  bone_mass = 2.4, bone_rate = 4.2, fat_mass = 15.2, skeletal_muscle = 22.5,
  visceral = 7, waist_hip_ratio = 0.8, body_age = 37, bmr = 1288, fat_free_mass = 42.5,
  device_score = 84
where openid='$TARGET';

update members set
  height = 158,
  best_lift = '{"bench":{"oneRM":30},"squat":{"oneRM":50},"deadlift":{"oneRM":60}}'::jsonb,
  sbd_total = 140,
  latest_body = jsonb_build_object(
    'weight', 57.7, 'height', 158, 'bodyFat', 26.4, 'muscle', 40.1, 'muscleRate', 69.5,
    'visceral', 7, 'bmi', 23.1, 'bodyAge', 37, 'bmr', 1288, 'fatFreeMass', 42.5,
    'deviceScore', 84, 'score', 84, 'date', '2026-11-10',
    'detail', '[{"key":"fat","label":"体脂率","score":40,"max":40}]'::jsonb
  )
where openid='$TARGET';
SQL
  echo '=== 当前 ==='
  psql -tAc "select count(*) from body_records where openid='$TARGET';"
  ;;
restore)
  echo '=== 还原 ==='
  ORIG=$(cat /tmp/xiaocaicai-backup.txt)
  BEST=$(echo "$ORIG" | cut -d'|' -f1)
  BODY=$(echo "$ORIG" | cut -d'|' -f2)
  HEIGHT=$(echo "$ORIG" | cut -d'|' -f3)
  psql -v ON_ERROR_STOP=1 <<SQL
delete from body_records where openid='$TARGET';
update members set
  best_lift = $( [ "$BEST" = "null" ] && echo "null" || echo "'$BEST'::jsonb" ),
  sbd_total = 0,
  latest_body = $( [ "$BODY" = "null" ] && echo "null" || echo "'$BODY'::jsonb" ),
  height = ${HEIGHT:-0}
where openid='$TARGET';
SQL
  psql -tAc "select coalesce(best_lift::text,'null'), coalesce(latest_body::text,'null'), height from members where openid='$TARGET';"
  psql -tAc "select count(*) from body_records where openid='$TARGET';"
  ;;
esac
