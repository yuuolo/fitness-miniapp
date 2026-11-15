#!/usr/bin/env bash
# 造几条成绩数据，用于验证排行榜条形图（跑完可清理）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
PORT=3016
TOKEN=chart-check-token
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

ADMIN=$(psql -tAc "select openid from members where role='admin' order by created_at limit 1;" | tr -d '\r\n')
echo "管理员: $ADMIN"

docker rm -f gym-chartcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-chartcheck \
  --network gym_default -p 127.0.0.1:${PORT}:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN="$TOKEN" \
  -e WX_APPID=unused -e WX_SECRET=unused \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do
  curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done

api() {
  curl -sS -m 20 -X POST "http://127.0.0.1:${PORT}/api" \
    -H 'content-type: application/json' -H "x-dev-token: $TOKEN" \
    --data-binary "{\"action\":\"$1\",\"code\":\"dev:$2\",\"data\":$3}"
}

# 四个陪练账号 + 成绩（卧推，形成 140/120/100/85 的梯队）
i=0
for spec in "阿强:140:5" "小林:120:3" "老王:100:5" "小陈:85:3"; do
  i=$((i+1))
  name=${spec%%:*}
  rest=${spec#*:}
  w=${rest%%:*}
  r=${rest##*:}
  openid="chart-seed-$i"
  api updateProfile "$openid" "{\"nickName\":\"$name\",\"phone\":\"1380000000$i\"}" >/dev/null
  api saveStrength "$ADMIN" "{\"openid\":\"$openid\",\"lift\":\"bench\",\"weight\":$w,\"reps\":$r}" >/dev/null
  echo "  $name  卧推 ${w}kg x ${r}次"
done

echo "=== 排行榜（本周）==="
api leaderboard "$ADMIN" '{"lift":"bench","period":"week"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print('  共', d['total'], '人上榜')
for x in d['top']:
    print('   #%d %-6s %6.1f %s' % (x['rank'], x['name'], x['value'], d['unit']))
"

docker rm -f gym-chartcheck >/dev/null 2>&1 || true
echo "CHART_SEED_DONE"
