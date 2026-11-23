#!/usr/bin/env bash
# 把测试库里指向 test-gym 的媒体地址迁移到 gym.novrein.com/test-api（新方案）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== 迁移前：storage.baseUrl ==='
psql -tAc "select value->'postgres'->>'baseUrl' from config where key = 'storage';"

psql -c "
update config
   set value = jsonb_set(value, '{postgres,baseUrl}', '\"https://gym.novrein.com/test-api\"'::jsonb)
 where key = 'storage' and value->'postgres' is not null;"

echo '=== 迁移动态里的媒体地址 ==='
psql -c "
update moments
   set media = replace(media::text, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')::jsonb
 where media::text like '%https://test-gym.novrein.com%';"
psql -c "
update challenge_videos
   set video_url = replace(video_url, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api'),
       video_thumb = replace(video_thumb, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')
 where video_url like 'https://test-gym.novrein.com%' or video_thumb like 'https://test-gym.novrein.com%';"
psql -c "
update strength_records
   set video_url = replace(video_url, 'https://test-gym.novrein.com', 'https://gym.novrein.com/test-api')
 where video_url like 'https://test-gym.novrein.com%';"

echo '=== 迁移后：最新一条动态的媒体 ==='
psql -tAc "select media::text from moments order by created_at desc limit 1;"
