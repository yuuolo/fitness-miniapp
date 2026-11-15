#!/usr/bin/env bash
# 积分功能开关：off 关闭 / on 打开 / show 只看不改
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
BASE=http://127.0.0.1
ACTION=${1:-show}

TOKEN=$(curl -sS -m 10 -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")
[ -z "$TOKEN" ] && { echo "登录失败"; exit 1; }

case "$ACTION" in
  off) VALUE=false ;;
  on)  VALUE=true ;;
  show) VALUE="" ;;
  *) echo "用法: toggle-points.sh [off|on|show]"; exit 1 ;;
esac

python3 - "$TOKEN" "$VALUE" <<'PY'
import json, sys, urllib.request

token, raw = sys.argv[1], sys.argv[2]
BASE = 'http://127.0.0.1'

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('content-type', 'application/json')
    req.add_header('x-admin-token', token)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

def show(title):
    d = call('GET', '/api/admin/features')['data']
    print(title)
    for f in d['features']:
        mark = '开启' if f['enabled'] else '隐藏'
        print('  %-10s %-12s %s' % (f['key'], f['name'], mark))
    return d

show('当前：')
if raw:
    call('PUT', '/api/admin/features', {'state': {'points': raw == 'true'}})
    show('\n改后：')
PY
