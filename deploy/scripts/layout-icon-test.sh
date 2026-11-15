#!/usr/bin/env bash
# 造两个快捷入口：一个不带图标、一个带图标，用于验证「没选就不显示」
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1
ACTION=${1:-add}

TOKEN=$(curl -sS -m 10 -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")

python3 - "$TOKEN" "$ACTION" <<'PY'
import json, sys, urllib.request

token, action = sys.argv[1], sys.argv[2]
BASE = 'http://127.0.0.1'

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('content-type', 'application/json')
    req.add_header('x-admin-token', token)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

d = call('GET', '/api/admin/layout')['data']
roles, meta = d['roles'], d['meta']

if action == 'add':
    noIcon = call('POST', '/api/admin/layout/link', {
        'page': '/pages/rank/rank',
        'title': '无图标入口',
        'desc': '这个不显示图标'
    })['data']
    withIcon = call('POST', '/api/admin/layout/link', {
        'page': '/pages/competitions/competitions',
        'title': '带图标入口',
        'desc': '这个有图标',
        'icon': '🏆'
    })['data']
    print('无图标: icon=%r' % noIcon.get('icon'))
    print('带图标: icon=%r' % withIcon.get('icon'))
    roles['admin'] = [noIcon, withIcon] + [b for b in roles['admin'] if b['type'] != 'link']
    call('POST', '/api/admin/layout', {'roles': roles})
    print('已加到管理员首页（共 %d 个模块）' % len(roles['admin']))
else:
    call('POST', '/api/admin/layout', {'roles': meta['defaults']})
    print('已恢复默认布局')
PY
