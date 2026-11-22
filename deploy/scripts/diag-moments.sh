#!/usr/bin/env bash
# 排查：体验版发的友圈视频为什么别人看不到
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== 测试库最近的友圈动态（含媒体）==='
psql -c "
select m.id,
       coalesce(mb.nick_name, m.openid) as 发布人,
       m.type,
       left(m.content, 20) as 内容,
       jsonb_array_length(coalesce(m.media::jsonb, '[]'::jsonb)) as 附件数,
       to_timestamp(m.created_at/1000) as 时间
  from moments m left join members mb on mb.openid = m.posted_by
 order by m.created_at desc limit 8;"

echo '=== 最新 5 条媒体文件 ==='
psql -c "
select id, mime, length(bytes) as 字节, to_timestamp(created_at/1000) as 时间
  from media order by created_at desc limit 5;"

echo '=== 测试环境管理后台密码 ==='
grep -E '^STAGING_ADMIN_PASSWORD=' .env | sed 's/^/  /'
echo '=== 正式环境管理后台密码（对比）==='
grep -E '^ADMIN_PASSWORD=' .env | sed 's/^/  /'
