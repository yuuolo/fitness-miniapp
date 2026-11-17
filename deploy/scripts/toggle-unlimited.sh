#!/usr/bin/env bash
# 临时把限制设成「不限」，便于小程序端验证提示文案；之后恢复
set -uo pipefail
cd /opt/gym
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1
TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
MODE="${1:-unlimited}"
if [ "$MODE" = "unlimited" ]; then
  BODY='{"value":{"maxDuration":0,"maxVideoMB":0,"maxTotalMB":0,"maxRawVideoMB":0}}'
else
  BODY='{"value":{"maxDuration":15,"maxVideoMB":12,"maxRawVideoMB":60,"maxCount":9,"maxTotalMB":40,"feedThumbs":9}}'
fi
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('summary') or d)"
echo "TOKEN=$TOKEN" > /tmp/admin-token.txt
