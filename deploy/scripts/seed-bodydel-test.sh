#!/usr/bin/env bash
# 造一个临时会员 + 两条体测记录，用于验证「删除历史体测」；clear 时整体删除
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
OPENID=uitest-bodydel

case "${1:-set}" in
set)
  psql -v ON_ERROR_STOP=1 <<SQL
delete from body_records where openid = '$OPENID';
delete from members where openid = '$OPENID';
insert into members (openid, nick_name, phone, role, created_at)
values ('$OPENID', '删除测试会员', '13800009999', 'member', $(date +%s000));
insert into body_records (id, openid, date, measured_at, weight, height, bmi, gender, score, report_image, source, operator, created_at)
values
  ('uitest_body_1', '$OPENID', '2026-03-01', 1772000000000, 70.5, 175, 23.0, 'male', 72,
   'https://gym.novrein.com/api/media/9c23dfbde22451c786ee875098f904f4', 'staff', 'uitest', 1772000000000),
  ('uitest_body_2', '$OPENID', '2026-04-01', 1774600000000, 68.2, 175, 22.3, 'male', 75,
   '', 'staff', 'uitest', 1774600000000);
update members set height = 175, latest_body = jsonb_build_object(
  'weight', 68.2, 'height', 175, 'bodyFat', 18, 'bmi', 22.3, 'score', 75,
  'date', '2026-04-01', 'detail', '[]'::jsonb)
where openid = '$OPENID';
SQL
  psql -c "select id, date, weight from body_records where openid='$OPENID' order by date;"
  ;;
clear)
  psql -c "delete from body_records where openid='$OPENID'; delete from members where openid='$OPENID';"
  psql -tAc "select count(*) from members where openid='$OPENID';"
  ;;
esac
