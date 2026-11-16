#!/usr/bin/env bash
# 生产验证：改力量成绩后，评分立刻变化（无需重新录体测）；随后还原
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE

docker rm -f gym-dyncheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-dyncheck --network gym_default -p 127.0.0.1:3036:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=dyn-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3036/health >/dev/null 2>&1 && break; sleep 1; done

score_of() {
  curl -sS -m 20 -X POST http://127.0.0.1:3036/api \
    -H 'content-type: application/json' -H 'x-dev-token: dyn-token' \
    --data-binary "{\"action\":\"myFitness\",\"code\":\"dev:$ADMIN\",\"data\":{}}" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data') or {}
lb = data.get('latestBody') or {}
detail = lb.get('detail') or []
st = [x for x in detail if x.get('key') == 'strength']
print('  总分 %s ｜ 明细: %s ｜ 相对力量: %s' % (
  lb.get('score'),
  ', '.join('%s %s/%s' % (x.get('label'), x.get('score'), x.get('max')) for x in detail),
  (st[0]['score'] if st else '（无此项）')))
"
}

echo '=== 1. 当前（没有力量成绩）==='
score_of

echo '=== 2. 加一条卧推 100kg（不动体测记录）==='
psql -tAc "update members set best_lift = '{\"bench\":{\"oneRM\":100}}'::jsonb, sbd_total = 100 where openid='$ADMIN';" >/dev/null
score_of

echo '=== 3. 再补齐深蹲/硬拉（仍不动体测记录）==='
psql -tAc "update members set best_lift = '{\"bench\":{\"oneRM\":100},\"squat\":{\"oneRM\":140},\"deadlift\":{\"oneRM\":170}}'::jsonb, sbd_total = 410 where openid='$ADMIN';" >/dev/null
score_of

echo '=== 4. 还原 best_lift ==='
psql -tAc "update members set best_lift = '{}'::jsonb, sbd_total = 0 where openid='$ADMIN';" >/dev/null
score_of

docker rm -f gym-dyncheck >/dev/null 2>&1 || true
