#!/usr/bin/env bash
# 导出两个库的友圈媒体清单，供本机审计
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)

SQL="select json_build_object('id',m.id,'author',coalesce(mb.nick_name,m.openid),'content',left(m.content,20),'media',m.media)::text
       from moments m left join members mb on mb.openid = m.openid order by m.created_at desc;"

docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -tAc "$SQL" > /tmp/staging-audit.jsonl
docker exec -e PGPASSWORD="$PW" gym-db-1 psql -U postgres -d gym -tAc "$SQL" > /tmp/prod-audit.jsonl
echo "测试库 $(wc -l < /tmp/staging-audit.jsonl) 行 / 正式库 $(wc -l < /tmp/prod-audit.jsonl) 行"
