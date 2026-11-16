#!/usr/bin/env bash
# 看会员布局里那个自定义「竞赛预览」卡片指向哪里
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
TOKEN=$(curl -sS -m 10 -X POST "http://127.0.0.1/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")

python3 - "$TOKEN" <<'PY'
import json, sys, urllib.request
token = sys.argv[1]
req = urllib.request.Request('http://127.0.0.1/api/admin/layout')
req.add_header('x-admin-token', token)
with urllib.request.urlopen(req, timeout=20) as r:
    data = json.loads(r.read().decode())['data']

for role, blocks in data['roles'].items():
    print(role + ':')
    for i, b in enumerate(blocks):
        extra = ''
        if b.get('type') == 'link':
            extra = '  page=%s icon=%s' % (b.get('page'), b.get('icon') or '')
        print('  %d. %-13s %-14s enabled=%s%s' % (i + 1, b.get('type'), b.get('title') or '', b.get('enabled'), extra))
PY
