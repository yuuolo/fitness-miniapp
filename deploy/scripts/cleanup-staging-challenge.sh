#!/usr/bin/env bash
# 清理测试库里指定的挑战（按精确 id），并显示剩余数量
set -uo pipefail
cd /opt/gym
ID="${1:?用法: cleanup-staging-challenge.sh <id>}"
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker exec -e PGPASSWORD="$PW" gym-db-staging-1 psql -U postgres -d gym_staging \
  -c "delete from challenges where id = '$ID';" \
  -c "select count(*) as staging_challenges from challenges;"
