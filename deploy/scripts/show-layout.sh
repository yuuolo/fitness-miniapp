#!/usr/bin/env bash
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo '=== 已保存的布局 ==='
psql -tAc "select value::text from config where key='layout';" | python3 -c "
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    print('  (没有保存过，用默认布局)')
else:
    d = json.loads(raw)
    for role, blocks in (d.get('roles') or {}).items():
        print('  %s: %s' % (role, ','.join(b.get('type','?') for b in blocks)))
"

echo
echo '=== 接口实际返回（管理员角色）==='
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
    d = json.loads(r.read().decode())['data']
for role, blocks in (d.get('roles') or {}).items():
    print('  %s: %s' % (role, ','.join(b.get('type') for b in blocks)))
PY
