#!/usr/bin/env bash
# 恢复 Yu 的 5 条力量成绩 → 重算 best_lift/sbd_total → 重算评分
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
F=/opt/gym/backups/gym-20261116-202017.sql.gz
YU=o5bjc4jdaajzZZs582B7ao6qUagM

gunzip -c "$F" > /tmp/bk.sql 2>/dev/null
awk '/^COPY public.strength_records/{flag=1;next}/^\\\.$/{flag=0}flag' /tmp/bk.sql | grep "$YU" > /tmp/strength_yu.tsv
echo "从备份提取到 $(wc -l < /tmp/strength_yu.tsv) 条 Yu 的成绩"
docker cp /tmp/strength_yu.tsv gym-db-1:/tmp/strength_yu.tsv >/dev/null

cat > /tmp/restore.sql <<'SQL'
begin;
create temp table s_restore (
  id text, openid text, lift text, weight numeric, reps int, one_rm numeric,
  date text, operator text, created_at bigint
);
\copy s_restore (id, openid, lift, weight, reps, one_rm, date, operator, created_at) from '/tmp/strength_yu.tsv'
insert into strength_records (id, openid, lift, weight, reps, one_rm, date, operator, created_at)
  select id, openid, lift, weight, reps, one_rm, date, operator, created_at from s_restore
  on conflict (id) do nothing;

-- 用恢复后的记录重算该会员的最好成绩与三项合计
update members m set
  best_lift = coalesce((
    select jsonb_object_agg(lift, jsonb_build_object('oneRM', one_rm, 'weight', weight, 'reps', reps, 'date', date, 'at', created_at))
      from (
        select distinct on (lift) lift, weight, reps, one_rm, date, created_at
          from strength_records where openid = m.openid
         order by lift, one_rm desc, created_at desc
      ) x
  ), '{}'::jsonb),
  sbd_total = coalesce((
    select sum(one_rm) from (
      select distinct on (lift) lift, one_rm
        from strength_records
       where openid = m.openid and lift in ('bench','squat','deadlift')
       order by lift, one_rm desc
    ) y
  ), 0)
 where m.openid = 'o5bjc4jdaajzZZs582B7ao6qUagM';

select openid, lift, weight, reps, one_rm, date from strength_records
 where openid = 'o5bjc4jdaajzZZs582B7ao6qUagM' order by lift;
select nick_name, best_lift::text, sbd_total from members
 where openid = 'o5bjc4jdaajzZZs582B7ao6qUagM';
commit;
SQL

docker cp /tmp/restore.sql gym-db-1:/tmp/restore.sql >/dev/null
psql -f /tmp/restore.sql 2>&1 | tail -20

rm -f /tmp/bk.sql /tmp/strength_yu.tsv /tmp/restore.sql
