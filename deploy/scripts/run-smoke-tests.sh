#!/usr/bin/env bash
# 起独立容器跑「全 action 冒烟测试」，不占生产端口、不碰生产库
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB=gym_smoke

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

docker rm -f gym-smoke-test >/dev/null 2>&1 || true
docker run -d --rm --name gym-smoke-test \
  --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  -e DEV_LOGIN_TOKEN=smoke-token \
  -e WX_APPID=test -e WX_SECRET=test \
  -e PUBLIC_BASE_URL=https://gym.novrein.com \
  gym-server node index.js >/dev/null

for i in $(seq 1 40); do
  if docker exec gym-smoke-test node -e \
      "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(j=>{if(!j.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then break; fi
  sleep 1
done

docker run --rm --network gym_default \
  -e BASE=http://gym-smoke-test:3000 \
  -e DEV_LOGIN_TOKEN=smoke-token \
  gym-server node test/smoke.js
RC=$?

docker rm -f gym-smoke-test >/dev/null 2>&1 || true
exit $RC
