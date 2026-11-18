#!/usr/bin/env bash
# 清理联调时创建的测试挑战（按精确 id 删除）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ID="${1:-}"
if [ -z "$ID" ]; then echo '用法: cleanup-challenge-test.sh <challenge_id>'; exit 1; fi
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "delete from challenges where id = '$ID'; select count(*) as remaining_challenges from challenges;"
