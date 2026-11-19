#!/usr/bin/env bash
# 清掉测试帐号（雷阵雨）的订阅票，方便验证「打开小程序弹订阅提示」
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c "
delete from notify_subscriptions
 where openid in (select openid from members where nick_name = '雷阵雨');
select count(*) as 剩余订阅记录 from notify_subscriptions;"
