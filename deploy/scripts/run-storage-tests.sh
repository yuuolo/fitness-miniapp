#!/usr/bin/env bash
# 上传存储测试：独立库 gym_storage
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB=gym_storage

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

docker run --rm --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node test/storage.js
