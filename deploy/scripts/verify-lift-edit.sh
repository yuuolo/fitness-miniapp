#!/usr/bin/env bash
# 实测编辑功能：把「深蹲」改名 → 排行榜确认 → 改回
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
TOKEN=$(curl -sS -X POST http://127.0.0.1/api/admin/login -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
MEMBER=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='member' limit 1;" | tr -d '\r')

echo '=== 1. 改名：深蹲 → 杠铃深蹲 ==='
curl -sS -X POST http://127.0.0.1/api/admin/lifts -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"key":"squat","name":"杠铃深蹲","metric":"oneRM","sort":20}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);x=d.get('data') or {};print('  ', d.get('msg') or (x.get('name')+' / key='+str(x.get('key'))+' / metric='+str(x.get('metric'))))"

echo '=== 2. 排行榜是否显示新名称 ==='
docker rm -f gym-liftedit >/dev/null 2>&1 || true
docker run -d --rm --name gym-liftedit --network gym_default -p 127.0.0.1:3046:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=le-token -e WX_APPID=x -e WX_SECRET=x \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3046/health >/dev/null 2>&1 && break; sleep 1; done
curl -sS -X POST http://127.0.0.1:3046/api -H 'content-type: application/json' -H 'x-dev-token: le-token' \
  --data-binary "{\"action\":\"leaderboard\",\"code\":\"dev:$MEMBER\",\"data\":{\"lift\":\"squat\"}}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('  排行榜标题:', d['liftName'], '｜单位:', d['unit'])"

echo '=== 3. 标准项改比法应被拒 ==='
curl -sS -X POST http://127.0.0.1/api/admin/lifts -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"key":"squat","name":"杠铃深蹲","metric":"reps","sort":20}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=%s msg=%s' % (d.get('code'), d.get('msg')))"

echo '=== 4. 改回「深蹲」 ==='
curl -sS -X POST http://127.0.0.1/api/admin/lifts -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"key":"squat","name":"深蹲","metric":"oneRM","sort":20}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);x=d.get('data') or {};print('  ', x.get('name'))"
curl -sS -X POST http://127.0.0.1:3046/api -H 'content-type: application/json' -H 'x-dev-token: le-token' \
  --data-binary "{\"action\":\"leaderboard\",\"code\":\"dev:$MEMBER\",\"data\":{\"lift\":\"squat\"}}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('  排行榜标题已恢复:', d['liftName'])"

docker rm -f gym-liftedit >/dev/null 2>&1 || true
echo '=== 5. 当前项目列表 ==='
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c "select key,name,unit,metric,sort from lift_items order by sort;"
