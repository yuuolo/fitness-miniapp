#!/usr/bin/env bash
# 拉取会员体重、体脂、力量项数与当前评分明细，用来对比不同计分方案
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

psql -c "
select m.nick_name,
       m.gender,
       (m.latest_body->>'weight')::numeric as weight,
       (m.latest_body->>'bodyFat')::numeric as fat,
       (m.latest_body->>'bmi')::numeric as bmi,
       case when m.best_lift ? 'bench' then 1 else 0 end +
       case when m.best_lift ? 'squat' then 1 else 0 end +
       case when m.best_lift ? 'deadlift' then 1 else 0 end as sbd_n,
       coalesce((m.best_lift->'bench'->>'oneRM')::numeric, 0) as bench,
       coalesce((m.best_lift->'squat'->>'oneRM')::numeric, 0) as squat,
       coalesce((m.best_lift->'deadlift'->>'oneRM')::numeric, 0) as deadlift,
       (m.latest_body->>'score')::numeric as score,
       m.latest_body->'detail' as detail
  from members m
 where m.latest_body is not null
 order by score desc nulls last;"
