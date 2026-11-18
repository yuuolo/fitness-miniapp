#!/usr/bin/env bash
# 确认挑战相关表都空了
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "select (select count(*) from challenges) as challenges,
          (select count(*) from challenge_videos) as videos,
          (select count(*) from challenge_comments) as comments,
          (select count(*) from challenge_comment_likes) as likes;"
