#!/usr/bin/env bash
# 用接口给管理员录一条体测（触发评分），验证相对力量封顶
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE

docker rm -f gym-scorecheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-scorecheck --network gym_default -p 127.0.0.1:3035:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=score-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3035/health >/dev/null 2>&1 && break; sleep 1; done

echo '=== 会员自己录一条体测（体重 70 / 身高 175 / 体脂 15）==='
curl -sS -m 20 -X POST http://127.0.0.1:3035/api \
  -H 'content-type: application/json' -H 'x-dev-token: score-token' \
  --data-binary "{\"action\":\"saveBodyRecord\",\"code\":\"dev:$ADMIN\",\"data\":{\"openid\":\"$ADMIN\",\"weight\":70,\"height\":175,\"bodyFat\":15}}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data') or {}
print('  总分:', data.get('score'))
for it in (data.get('detail') or []):
    print('  ', it.get('label'), it.get('score'), '/', it.get('max'), '| capped=', it.get('capped'), '|', it.get('note'))
"

echo '=== 当前 best_lift 与三项计数 ==='
psql -tAc "select best_lift::text, jsonb_object_keys(best_lift) from members where openid='$ADMIN';" 2>/dev/null | head -5

docker rm -f gym-scorecheck >/dev/null 2>&1 || true
