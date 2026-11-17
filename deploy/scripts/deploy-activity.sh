#!/usr/bin/env bash
# 部署最新代码到生产 server 并自检新接口
set -uo pipefail
cd /opt/gym
docker compose build server 2>&1 | tail -1
docker compose up -d --force-recreate server 2>&1 | tail -1
sleep 12
docker compose exec -T server node -e "const f=require('/app/lib/fitness');console.log('deleteStrength:', typeof f.deleteStrength, '| deleteActivity:', typeof f.deleteActivity, '| importActivity:', typeof f.importActivity)"
echo '--- 冒烟：管理员查运动记录 ---'
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
TOKEN=$(curl -sS -X POST http://127.0.0.1/api/admin/login -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -sS "http://127.0.0.1/api/admin/activity?limit=3" -H "x-admin-token: $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('code') != 0:
    print('  失败:', d.get('msg'))
else:
    x = d['data']
    print('  共', x['total'], '条，返回', len(x['rows']), '条')
    for r in x['rows'][:3]:
        print('   ', r['name'], r['date'], r['typeName'], r['source'])
"
