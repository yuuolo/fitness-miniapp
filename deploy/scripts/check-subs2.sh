#!/usr/bin/env bash
# 看订阅票现状 + 最近的 subscribeTopic 调用日志
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
echo '=== 订阅票 ==='
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select m.nick_name, s.topic, s.tickets, to_timestamp(s.updated_at/1000) at
     from notify_subscriptions s left join members m on m.openid = s.openid
    order by s.updated_at desc limit 12;"
echo '=== 服务日志里最近的订阅/发送 ==='
docker compose logs server --since 30m 2>&1 | grep -iE 'subscribeMessage|notify|ticket' | tail -10 || echo '（无）'
