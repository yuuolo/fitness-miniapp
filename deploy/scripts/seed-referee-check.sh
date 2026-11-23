#!/usr/bin/env bash
# 在测试库造一条「我就是裁判」的挑战，用来验证裁判代传按钮
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

ME=$(psql -tAc "select openid from members where nick_name = '雷阵雨' limit 1;" | tr -d ' \r')
CH=$(psql -tAc "select openid from members where nick_name = '龙' limit 1;" | tr -d ' \r')
OP=$(psql -tAc "select openid from members where nick_name = 'Yu' limit 1;" | tr -d ' \r')
echo "裁判=$ME 发起=$CH 应战=$OP"

ID="refcheck$(date +%s)"
NOW=$(( $(date +%s) * 1000 ))
psql -c "
insert into challenges (id, challenger, opponent, referee, lift_key, metric, trash_talk,
  status, referee_state, judge_result, judge_note, judge_history, judge_snapshot,
  expire_at, submit_by, judge_by, created_at, finished_at)
values ('$ID', '$CH', '$OP', '$ME', 'deadlift', 'absolute', '裁判代传验证',
  'accepted', 'accepted', '', '', '[]'::jsonb, '{}'::jsonb,
  $NOW, $((NOW + 7200000)), 0, $NOW, 0);"
echo "$ID" > /tmp/refcheck-id.txt
echo "已创建: $ID"
psql -tAc "select id || ' ' || status from challenges where id = '$ID';"
