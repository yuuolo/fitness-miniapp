#!/usr/bin/env bash
# 订阅消息真实链路验证：
# 用生产凭据换取 access_token，配一个假模板 ID 触发发送，
# 期望微信返回 errcode=40037（模板 ID 无效）而不是 40001（token 无效），
# 以此证明 notify.js 的 token 缓存与请求体形态正确，且发送失败不影响预约业务。
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
APPID=$(sed -n 's/^WX_APPID=//p' .env)
SECRET=$(sed -n 's/^WX_SECRET=//p' .env)
DB=gym_notify
PORT=3002
TOKEN=notify-test-token

echo "=== 准备测试库 $DB ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

docker rm -f gym-notify-test >/dev/null 2>&1 || true
docker run -d --rm --name gym-notify-test \
  --network gym_default -p 127.0.0.1:${PORT}:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  -e DEV_LOGIN_TOKEN="$TOKEN" \
  -e WX_APPID="$APPID" -e WX_SECRET="$SECRET" \
  -e WX_TPL_BOOKING_SUCCESS=FAKE_TEMPLATE_ID_FOR_TEST \
  -e PUBLIC_BASE_URL=https://gym.novrein.com \
  gym-server node index.js >/dev/null

for i in $(seq 1 40); do
  curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done
echo "服务就绪"

api() { # api <action> <openid> <json-data>
  curl -sS -m 20 -X POST "http://127.0.0.1:${PORT}/api" \
    -H 'content-type: application/json' -H "x-dev-token: $TOKEN" \
    --data-binary "{\"action\":\"$1\",\"code\":\"dev:$2\",\"data\":$3}"
}

echo "=== 准备数据 ==="
api updateProfile admin '{"nickName":"管理员","phone":"13600000001"}' >/dev/null
api bootstrap admin '{}' | head -c 80; echo
api updateProfile coach '{"nickName":"教练","phone":"13600000002"}' >/dev/null
api setRole admin '{"openid":"coach","role":"coach"}' >/dev/null
api updateProfile member '{"nickName":"会员","phone":"13600000003"}' >/dev/null

TYPE=$(api listCardTypes admin '{}' | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([t['_id'] for t in d if t['kind']=='times'][0])")
api openCard admin "{\"openid\":\"member\",\"typeId\":\"$TYPE\",\"amount\":49900,\"payMethod\":\"cash\"}" >/dev/null
echo "  会员已办 10 次卡"

START=$(( $(date +%s%3N) + 7200000 ))
SCHED=$(api saveSchedule admin "{\"courseName\":\"订阅消息验证课\",\"kind\":\"group\",\"coachId\":\"coach\",\"startAt\":$START,\"duration\":60,\"capacity\":5,\"room\":\"测试房\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['_id'])")
echo "  已排课 $SCHED"

echo "=== 预约（会触发 bookingSuccess 订阅消息） ==="
api bookSchedule member "{\"scheduleId\":\"$SCHED\"}"; echo

sleep 4
echo "=== 服务端日志中的订阅消息结果 ==="
docker logs gym-notify-test 2>&1 | grep -E 'subscribeMessage|wxacode' | tail -5 || echo "  （没有订阅消息日志）"

echo "=== 预约本身是否成功（不受发送失败影响） ==="
api myBookings member '{}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
b=d['data']
print('  预约条数:', len(b))
if b: print('  状态:', b[0]['status'], '课程:', b[0]['title'])
"

docker rm -f gym-notify-test >/dev/null 2>&1 || true
echo "NOTIFY_DRILL_DONE"
