#!/usr/bin/env bash
# 清理会员布局里重复的「竞赛预览」自定义卡片，把真模块放到第 3 位
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
member = roles['member']

def show(label):
    print(label)
    for i, b in enumerate(member):
        print('  %d. %-13s %-10s enabled=%s' % (i + 1, b['type'], b.get('title') or '', b.get('enabled')))

show('=== 修改前（会员）===')

# 删掉指向竞赛页的自定义卡片（真模块已经有内容了）
before = len(member)
member = [b for b in member if not (b['type'] == 'link' and b.get('page') == '/pages/competitions/competitions')]
removed = before - len(member)
print('  删掉重复的自定义卡片: %d 个' % removed)

# 把 competitions 排到 quick 后面
idx = next((i for i, b in enumerate(member) if b['type'] == 'competitions'), None)
if idx is not None:
    block = member.pop(idx)
    insert_at = next((i for i, b in enumerate(member) if b['type'] == 'quick'), -1) + 1
    member.insert(insert_at, block)

roles['member'] = member
if removed:
    post('/api/admin/layout', {'roles': roles})
    print('  已保存')
else:
    print('  无需保存')

member = get('/api/admin/layout')['data']['roles']['member']
show('=== 修改后（会员）===')
PY
