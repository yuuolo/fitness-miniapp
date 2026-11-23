#!/usr/bin/env bash
# 检查各表的视频列 + 补迁移
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== 各表是否有 video_url ==='
psql -c "
select table_name, column_name
  from information_schema.columns
 where column_name like 'video%'
   and table_name in ('challenge_videos','strength_records','competition_entries','moments')
 order by table_name, column_name;"

echo '=== 剩余还指向 test-gym 的地方 ==='
psql -c "
select 'moments' as tbl, count(*) from moments where media::text like '%test-gym.novrein.com%'
union all
select 'challenge_videos', count(*) from challenge_videos where video_url like '%test-gym.novrein.com%'
union all
select 'strength_records', count(*) from strength_records where video_url like '%test-gym.novrein.com%';"

echo '=== 逐表迁移（列不存在会自动报错，不影响其它行）==='
psql -c "update challenge_videos
            set video_url = replace(video_url, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api'),
                video_thumb = replace(video_thumb, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')
          where video_url like 'https://test-gym.novrein.com%'
             or video_thumb like 'https://test-gym.novrein.com%';" 2>&1 | tail -1

psql -c "update strength_records
            set video_url = replace(video_url, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')
          where video_url like 'https://test-gym.novrein.com%';" 2>&1 | tail -1

psql -c "update competition_entries
            set video_url = replace(video_url, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')
          where video_url like 'https://test-gym.novrein.com%';" 2>&1 | tail -1
