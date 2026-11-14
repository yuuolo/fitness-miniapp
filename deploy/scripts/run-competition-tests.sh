#!/usr/bin/env bash
# 排行榜 + 竞赛测试：独立库 gym_comp
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB=gym_comp

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

docker run --rm --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  gym-server node test/competition.js
