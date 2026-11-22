#!/usr/bin/env bash
# 导出测试库友圈媒体清单（供本地检查可访问性）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging -tAc "
select json_build_object(
  'id', m.id,
  'author', coalesce(mb.nick_name, m.openid),
  'content', left(m.content, 20),
  'media', m.media
)::text
from moments m left join members mb on mb.openid = m.openid
order by m.created_at desc;" > /tmp/moments-audit.jsonl
echo "导出行数: $(wc -l < /tmp/moments-audit.jsonl)"
