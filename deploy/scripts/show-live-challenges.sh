#!/usr/bin/env bash
# 看看生产里剩下那条挑战是什么（可能是用户自己在测试）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c "
select c.id, cm.nick_name as 发起人, om.nick_name as 对手, rm.nick_name as 裁判,
       c.lift_key, c.status, c.referee_state, c.judge_result,
       to_timestamp(c.created_at/1000) as 创建时间,
       (select count(*) from challenge_videos v where v.challenge_id = c.id) as 视频数
  from challenges c
  left join members cm on cm.openid = c.challenger
  left join members om on om.openid = c.opponent
  left join members rm on rm.openid = c.referee;"
