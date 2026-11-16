#!/usr/bin/env bash
# 给线上已保存的会员首页布局补上「竞赛预览」（默认布局已改，但库里是旧数据）
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
meta = data.get('meta') or {}
block_meta = {b['type']: b for b in (meta.get('blocks') or [])}

def show():
    for role, blocks in roles.items():
        print('  %s: %s' % (role, ', '.join(b['type'] + ('' if b.get('enabled', True) else '(隐藏)') for b in blocks)))

print('=== 修改前 ===')
show()

changed = False
for role in ('member', 'coach', 'admin'):
    blocks = roles.get(role) or []
    has = any(b['type'] == 'competitions' for b in blocks)
    if has:
        # 已存在但被关掉的话，保持用户设置不动
        print('  %s 已有竞赛预览' % role)
        continue
    m = block_meta.get('competitions', {})
    new_block = {
        'id': 'competitions', 'type': 'competitions',
        'title': m.get('name', '竞赛预览'), 'desc': m.get('desc', '进行中的竞赛'),
        'enabled': True
    }
    # 放在「快捷入口」之后、排行榜之前
    idx = len(blocks)
    for i, b in enumerate(blocks):
        if b['type'] in ('rank', 'moments', 'competitions'):
            idx = i
            break
    blocks.insert(idx, new_block)
    roles[role] = blocks
    changed = True
    print('  + 给 %s 加了竞赛预览（第 %d 位）' % (role, idx + 1))

if changed:
    post('/api/admin/layout', {'roles': roles})
    print('  已保存')
else:
    print('  不需要改动')

print('=== 修改后 ===')
data = get('/api/admin/layout')['data']
roles = data['roles']
show()
PY
