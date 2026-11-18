#!/usr/bin/env bash
# 挑战功能讨论用的现状数据
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo '=== 会员与数据完整度 ==='
psql -c "
select count(*) as 会员总数,
       count(*) filter (where latest_body is not null) as 有身体数据,
       count(*) filter (where best_lift ? 'bench' and best_lift ? 'squat' and best_lift ? 'deadlift') as 三项齐全,
       count(*) filter (where best_lift <> '{}'::jsonb) as 有力量成绩
  from members;"

echo '=== 各项目有多少人录过 ==='
psql -c "
select lift, count(distinct openid) as 人数, max(one_rm) as 最好成绩
  from strength_records group by lift order by 人数 desc;"

echo '=== 综合评分榜（当前）==='
psql -c "
select m.nick_name,
       (m.latest_body->>'score')::numeric as 分数,
       case when m.best_lift ? 'bench' and m.best_lift ? 'squat' and m.best_lift ? 'deadlift' then '三项齐全' else '缺项' end as 力量数据
  from members m
 where m.latest_body is not null
 order by 分数 desc;"

echo '=== 挑战相关表是否已存在 ==='
psql -tAc "select count(*) from information_schema.tables where table_name in ('challenges','challenge_entries');"
