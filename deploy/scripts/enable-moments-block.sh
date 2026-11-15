#!/usr/bin/env bash
# 把管理员首页的「友圈预览」模块重新启用（之前被误关）
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
TOKEN=$(curl -sS -m 10 -X POST "http://127.0.0.1/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")

python3 - "$TOKEN" <<'PY'
import json, sys, urllib.request

token = sys.argv[1]
BASE = 'http://127.0.0.1'

def get(path):
    req = urllib.request.Request(BASE + path)
    req.add_header('x-admin-token', token)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method='POST')
    req.add_header('content-type', 'application/json')
    req.add_header('x-admin-token', token)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

data = get('/api/admin/layout')['data']
roles = data['roles']
changed = False
for role, blocks in roles.items():
    for b in blocks:
        if b.get('type') == 'moments' and b.get('enabled') is False:
            b['enabled'] = True
            changed = True
            print('  已启用 %s 的友圈预览' % role)

if changed:
    post('/api/admin/layout', {'roles': roles})
    print('  已保存')
else:
    print('  不需要改动')

# 复核
data = get('/api/admin/layout')['data']
for role, blocks in data['roles'].items():
    print('  %s: %s' % (role, ','.join('%s%s' % (b['type'], '' if b.get('enabled') else '(隐藏)') for b in blocks)))
PY
