#!/usr/bin/env bash
# 用独立测试库跑全部测试（脚本内部会建库，不碰生产 gym）
set -uo pipefail
cd /opt/gym

echo '=== 确认脚本用独立库 ==='
grep -h 'DATABASE_URL' scripts/run-tests.sh scripts/run-layout-tests.sh 2>/dev/null | head -4

for s in run-tests run-layout-tests run-http-tests run-competition-tests run-storage-tests run-feature-tests run-report-tests; do
  echo
  echo "--- $s ---"
  bash "scripts/$s.sh" 2>&1 | tail -2
done

echo
echo '--- 冒烟 ---'
bash scripts/run-smoke-tests.sh 2>&1 | tail -2

echo
echo '=== 生产库数据复核（应该还是 6 个账号）==='
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc \
  "select count(*) || ' 个账号，' || (select count(*) from moments) || ' 条友圈' from members;"
