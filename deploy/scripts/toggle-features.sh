#!/usr/bin/env bash
# 通过管理接口切换功能开关（给自动化验证用）
# 用法：toggle-features.sh <preset>
#   all-on                全部开启
#   classes-venues-cards-off  关闭会员卡 + 团课 + 娱乐（友圈/健身/排行保持开启）
#   core-only             只留友圈 + 我的（入口码、约课、娱乐、健身、排行都关）
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1
PRESET=${1:-all-on}

case "$PRESET" in
  all-on)
    STATE='{"cards":true,"classes":true,"venues":true,"moments":true,"fitness":true,"rank":true}' ;;
  classes-venues-cards-off)
    STATE='{"cards":false,"classes":false,"venues":false,"moments":true,"fitness":true,"rank":true}' ;;
  core-only)
    STATE='{"cards":false,"classes":false,"venues":false,"moments":true,"fitness":false,"rank":false}' ;;
  *)
    echo "未知预设：$PRESET"; exit 1 ;;
esac

TOKEN=$(curl -sS -m 10 -X POST "$BASE/api/admin/login" \
  -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "登录失败"; exit 1
fi

echo "应用预设：$PRESET"
printf '%s' "$STATE" > /tmp/feature-state.json
python3 - "$TOKEN" <<'PY'
import json, sys, urllib.request

token = sys.argv[1]
state = json.load(open('/tmp/feature-state.json', encoding='utf-8'))
body = json.dumps({'state': state}).encode()
req = urllib.request.Request('http://127.0.0.1/api/admin/features', data=body, method='PUT')
req.add_header('content-type', 'application/json')
req.add_header('x-admin-token', token)
with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read().decode())
if data.get('code') != 0:
    print('  失败:', data.get('msg')); raise SystemExit(1)
d = data['data']
print(' ', d.get('summary'))
for f in d['features']:
    print('  %-18s %s' % (f['key'], '开启' if f['enabled'] else '隐藏'))
PY
rm -f /tmp/feature-state.json
