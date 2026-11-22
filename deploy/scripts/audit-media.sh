#!/usr/bin/env bash
# 审计测试库友圈里的视频/图片地址，找出加载不了的
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== 所有动态的媒体地址 ==='
psql -tAc "
select m.id || ' | ' || coalesce(mb.nick_name, m.openid) || ' | ' || m.media::text
  from moments m left join members mb on mb.openid = m.openid
 order by m.created_at desc;" > /tmp/moment-media.txt

echo '--- 地址形态统计 ---'
grep -o 'https\?://[^"]*' /tmp/moment-media.txt | sed 's#/api/media/.*##' | sort | uniq -c
grep -o 'cloud://[^"]*' /tmp/moment-media.txt | wc -l | sed 's/^/  cloud:\/\/ 剩余 /'

echo
echo '=== 逐个检查 /api/media 是否存在（测试库）==='
for id in $(grep -o '/api/media/[a-f0-9]*' /tmp/moment-media.txt | sed 's#/api/media/##' | sort -u); do
  EXISTS=$(psql -tAc "select count(*) from media where id = '$id';" | tr -d ' \r')
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://test-gym.novrein.com/api/media/$id" --max-time 12 || true)
  if [ "$CODE" != "200" ]; then
    echo "  ✗ $id  media表=$EXISTS  HTTP=$CODE"
  fi
done
echo '（没列出来的都是 200）'
