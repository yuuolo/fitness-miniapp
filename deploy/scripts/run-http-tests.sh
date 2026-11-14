#!/usr/bin/env bash
# 重建镜像 → 准备独立测试库 → 在容器里跑 HTTP 层测试
# 用法：bash /tmp/run-http-tests.sh
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB=gym_http

echo "=== 准备测试库 $DB ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" 2>&1 | tail -2

echo "=== 启动测试容器 gym-http-test ==="
docker rm -f gym-http-test >/dev/null 2>&1 || true
docker run -d --rm --name gym-http-test \
  --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  -e DEV_LOGIN_TOKEN=http-test-token \
  -e WX_APPID=test -e WX_SECRET=test \
  -e PUBLIC_BASE_URL=https://gym.novrein.com \
  gym-server node index.js >/dev/null

READY=0
for i in $(seq 1 40); do
  if docker exec gym-http-test node -e \
      "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(j=>{if(!j.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    READY=1
    echo "服务就绪（${i}s）"
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "服务未就绪，容器日志："
  docker logs --tail=30 gym-http-test
  docker rm -f gym-http-test >/dev/null 2>&1 || true
  exit 1
fi

echo "=== 运行 HTTP 测试 ==="
docker run --rm --network gym_default \
  -e BASE=http://gym-http-test:3000 \
  -e DEV_LOGIN_TOKEN=http-test-token \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  gym-server node test/http.js
RC=$?
echo "=== HTTP 测试退出码: $RC ==="

docker rm -f gym-http-test >/dev/null 2>&1 || true
exit $RC
