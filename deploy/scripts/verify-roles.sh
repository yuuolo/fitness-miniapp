#!/usr/bin/env bash
# 验证角色权限矩阵：会员 / 教练 / 管理员 三级
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
PORT=3017
TOKEN=role-check-token
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

ADMIN=$(psql -tAc "select openid from members where role='admin' limit 1;" | tr -d '\r\n')
COACH=$(psql -tAc "select openid from members where role='coach' limit 1;" | tr -d '\r\n')

echo "=== 造一个临时会员做测试对象 ==="
psql -q -c "delete from members where openid='role-test-member';"
psql -q -c "insert into members (openid, nick_name, phone, role, created_at) values ('role-test-member','角色测试','13700001111','member', $(date +%s%3N));"

docker rm -f gym-rolecheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-rolecheck \
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
  local as="$1" action="$2" data="$3"
  curl -sS -m 20 -X POST "http://127.0.0.1:${PORT}/api" \
    -H 'content-type: application/json' -H "x-dev-token: $TOKEN" \
    --data-binary "{\"action\":\"$action\",\"code\":\"dev:$as\",\"data\":$data}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(('通过 ' if d.get('code')==0 else '拒绝 ') + str(d.get('msg') or '')[:40])"
}

echo
echo "───── 设置角色：前台应被拒绝 ─────"
echo -n "  设成 staff      "; api "$ADMIN" setRole "{\"openid\":\"role-test-member\",\"role\":\"staff\"}"
echo -n "  设成 coach      "; api "$ADMIN" setRole "{\"openid\":\"role-test-member\",\"role\":\"coach\"}"
echo -n "  设回 member     "; api "$ADMIN" setRole "{\"openid\":\"role-test-member\",\"role\":\"member\"}"

echo
echo "───── 教练能力 ─────"
echo -n "  搜索会员        "; api "$COACH" searchMembers '{"keyword":"角色测试"}'
echo -n "  看会员详情      "; api "$COACH" memberDetail '{"openid":"role-test-member"}'
echo -n "  录身体数据      "; api "$COACH" saveBodyRecord '{"openid":"role-test-member","weight":70,"height":175}'
echo -n "  改别人资料      "; api "$COACH" staffUpdateProfile '{"openid":"role-test-member","phone":"13800002222"}'
echo -n "  办卡            "; api "$COACH" openCard '{"openid":"role-test-member","typeId":"x","amount":100,"payMethod":"cash"}'

echo
echo "───── 管理员能力 ─────"
echo -n "  改会员资料      "; api "$ADMIN" staffUpdateProfile '{"openid":"role-test-member","phone":"13800003333"}'
echo -n "  设角色          "; api "$ADMIN" setRole '{"openid":"role-test-member","role":"member"}'

echo
echo "=== 清理 ==="
psql -q -c "delete from members where openid='role-test-member';"
psql -c "select openid, nick_name, role from members order by role;"
docker rm -f gym-rolecheck >/dev/null 2>&1 || true
echo "ROLE_CHECK_DONE"
