#!/usr/bin/env bash
# 修测试环境的媒体地址前缀（storage 配置是从正式库备份带过来的 gym 域名）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging "$@"; }

echo '=== 修复前：config.storage ==='
psql -tAc "select value::text from config where key = 'storage';" | head -c 600; echo

echo '=== 把 storage.postgres.baseUrl 改成测试域名 ==='
psql -c "
update config
   set value = jsonb_set(value, '{postgres,baseUrl}', '\"https://gym.novrein.com/test-api\"'::jsonb)
 where key = 'storage'
   and value->'postgres' is not null;"

echo '=== 修复已发布动态里的媒体地址（gym → test-gym）==='
psql -c "
update moments
   set media = replace(media::text, 'https://gym.novrein.com/api/media/', 'https://gym.novrein.com/test-api/api/media/')::jsonb
 where media::text like '%https://gym.novrein.com/api/media/%';"

psql -c "
update media set url = replace(url, 'https://gym.novrein.com', 'https://gym.novrein.com/test-api')
 where url like 'https://gym.novrein.com%';" 2>/dev/null || echo '（media 表无 url 列，跳过）'

echo '=== 修复后：最新动态的媒体地址 ==='
psql -tAc "select media::text from moments order by created_at desc limit 1;"

echo '=== 测试域名能否取到那个视频 ==='
curl -s -o /dev/null -w '  视频 HTTP %{http_code}\n' https://gym.novrein.com/test-api/api/media/4025e55f92b7b3281da78b21266523ee --max-time 15
curl -s -o /dev/null -w '  封面 HTTP %{http_code}\n' https://gym.novrein.com/test-api/api/media/3870a3a5b90f6beb15e4dfd55c13069b --max-time 15
