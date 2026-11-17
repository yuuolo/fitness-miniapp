#!/usr/bin/env bash
# 临时把 feedThumbs 设为 1 以便验证 +N 展示
set -uo pipefail
cd /opt/gym
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1
TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
VALUE="${1:-1}"
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary "{\"value\":{\"feedThumbs\":$VALUE}}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('summary') or d)"
echo "TOKEN=$TOKEN" > /tmp/admin-token.txt
