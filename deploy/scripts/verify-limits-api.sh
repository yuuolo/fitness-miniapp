#!/usr/bin/env bash
# 验证管理页「上传与展示限制」接口与前端卡片
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1

echo '=== 1. 管理页是否包含新卡片 ==='
curl -sS "$BASE/admin" | grep -c 'lim-maxDuration\|上传与展示限制'

echo '=== 2. 登录拿 token ==='
TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "  token: ${TOKEN:0:12}..."

echo '=== 3. 读取限制（应为默认值）==='
curl -sS "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print('  value:', json.dumps(d['value'], ensure_ascii=False))
print('  ranges:', json.dumps(d['ranges'], ensure_ascii=False))
"

echo '=== 4. 改成更严格的限制 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":10,"maxVideoMB":8,"maxCount":3,"maxTotalMB":12,"feedThumbs":2}}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ',d['data']['summary'])"

echo '=== 5. 小程序首页接口是否读到新值 ==='
docker rm -f gym-limcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-limcheck --network gym_default -p 127.0.0.1:3037:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=lim-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3037/health >/dev/null 2>&1 && break; sleep 1; done
curl -sS -X POST http://127.0.0.1:3037/api -H 'content-type: application/json' -H 'x-dev-token: lim-token' \
  --data-binary '{"action":"home","code":"dev:o5bjc4qI1ME8eNUtWE09sLqOE4aE","data":{}}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  mediaLimits:', json.dumps(d['data'].get('mediaLimits'), ensure_ascii=False))"
docker rm -f gym-limcheck >/dev/null 2>&1 || true

echo '=== 6. 越界值应被拒 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":999}}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=%s msg=%s' % (d['code'], d.get('msg')))"

echo '=== 7. 恢复默认 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":15,"maxVideoMB":12,"maxCount":9,"maxTotalMB":40,"feedThumbs":9}}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ',d['data']['summary'])"

echo "TOKEN=$TOKEN" > /tmp/admin-token.txt
