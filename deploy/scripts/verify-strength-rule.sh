#!/usr/bin/env bash
# 验证：新的相对力量规则在真实接口上的表现
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMIN=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='admin' limit 1;" | tr -d '\r')

docker rm -f gym-scorecheck2 >/dev/null 2>&1 || true
docker run -d --rm --name gym-scorecheck2 --network gym_default -p 127.0.0.1:3045:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=sc-token -e WX_APPID=x -e WX_SECRET=x \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3045/health >/dev/null 2>&1 && break; sleep 1; done

echo '=== 综合评分榜（新规则）==='
curl -sS -X POST http://127.0.0.1:3045/api -H 'content-type: application/json' -H 'x-dev-token: sc-token' \
  --data-binary "{\"action\":\"leaderboard\",\"code\":\"dev:$ADMIN\",\"data\":{\"lift\":\"score\"}}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
for r in d['top']:
    print('  %d. %-6s %3s 分' % (r['rank'], r['name'], r['value']))
"

echo '=== 各会员相对力量明细（说明文案）==='
for NAME in '小菜菜' '大只包' '👀' '雷阵雨' 'Yu' '龙'; do
  OID=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where nick_name = '$NAME' limit 1;" | tr -d '\r')
  [ -z "$OID" ] && continue
  curl -sS -X POST http://127.0.0.1:3045/api -H 'content-type: application/json' -H 'x-dev-token: sc-token' \
    --data-binary "{\"action\":\"memberFitness\",\"code\":\"dev:$ADMIN\",\"data\":{\"openid\":\"$OID\"}}" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
lb = d.get('latestBody') or {}
st = [x for x in (lb.get('detail') or []) if x.get('key') == 'strength']
s = st[0] if st else {}
print('  %-6s 总分 %3s ｜ 相对力量 %4s/40 ｜ %s' % ('$NAME', lb.get('score'), s.get('score'), s.get('note') or '（三项齐全）'))
"
done

docker rm -f gym-scorecheck2 >/dev/null 2>&1 || true
