#!/usr/bin/env bash
# 清理测试库友圈里失效的视频附件（保留文字内容）
# 用法：bash scripts/clean-broken-moments.sh [数据库名，默认 gym_staging]
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB="${1:-gym_staging}"
CONTAINER=$([ "$DB" = "gym_staging" ] && echo gym-db-staging-1 || echo gym-db-1)
psql() { docker exec -e PGPASSWORD="$PW" "$CONTAINER" psql -U postgres -d "$DB" "$@"; }

echo "=== 目标库: $DB ==="

echo '--- 失效媒体引用（media 表里不存在的 id）---'
psql -c "
with refs as (
  select m.id as moment_id, m.openid, m.content, x.value->>'fileID' as file_id, x.value->>'thumb' as thumb
    from moments m, jsonb_array_elements(m.media) x
   where x.value ? 'fileID' and x.value->>'fileID' <> ''
)
select r.*
  from refs r
 where not exists (
   select 1 from media md
    where md.id = substring(r.file_id from '/api/media/([^\"?]+)')
       or md.id = substring(coalesce(r.thumb,'') from '/api/media/([^\"?]+)')
 );"

echo '--- 清理：把失效的媒体从动态里移除，类型改成 text ---'
psql -c "
update moments m
   set media = coalesce((
         select jsonb_agg(x.value)
           from jsonb_array_elements(m.media) x
          where exists (select 1 from media md
                         where md.id = substring(coalesce(x.value->>'fileID','') from '/api/media/([^\"?]+)' ))
       ), '[]'::jsonb),
       type = case
                when (select count(*) from media md
                       where md.id = substring(coalesce(m.media->0->>'fileID','') from '/api/media/([^\"?]+)')) > 0
                then m.type else 'text' end
 where jsonb_array_length(m.media) > 0
   and not exists (
     select 1 from jsonb_array_elements(m.media) x, media md
      where md.id = substring(coalesce(x.value->>'fileID','') from '/api/media/([^\"?]+)')
   );"

echo '--- 清理后检查 ---'
psql -c "
select id, coalesce(mb.nick_name,'?') as 作者, left(m.content,16) as 内容,
       jsonb_array_length(m.media) as 附件数, m.type
  from moments m left join members mb on mb.openid = m.openid
 order by m.created_at desc limit 10;"
