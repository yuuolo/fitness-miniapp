#!/usr/bin/env bash
# 验证：删掉的项目不会被重启自动补回；「恢复默认五项」能手动补回
set -uo pipefail
cd /opt/gym
PW_ADMIN=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
BASE=http://127.0.0.1
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

TOKEN=$(curl -sS -m 10 -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$PW_ADMIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))")

admin() {
  curl -sS -m 20 -X POST "$BASE/api/admin/lifts$1" \
    -H 'content-type: application/json' -H "x-admin-token: $TOKEN" \
    --data-binary "${2:-{\}}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('msg') or '成功')"
}

show() { psql -tAc "select string_agg(key, ',' order by sort) from lift_items;"; }

echo "1) 当前项目：$(show)"
echo "2) 删除「站姿肩推」：$(admin '/delete' '{"key":"ohp"}')"
echo "   现在：$(show)"
echo "3) 重启服务（模拟第二天开机）"
docker compose restart server >/dev/null 2>&1
for i in $(seq 1 30); do curl -sf -m 2 "$BASE/health" >/dev/null 2>&1 && break; sleep 1; done
sleep 2
echo "   重启后：$(show)"
if psql -tAc "select 1 from lift_items where key='ohp';" | grep -q 1; then
  echo "   ✗ 被自动补回来了（不应该）"
else
  echo "   ✓ 删除是持久的，没有被自动补回"
fi

echo "4) 点「恢复默认五项」"
admin '/restore' '{}'
echo "   现在：$(show)"

echo "5) 每个项目的可删除状态"
curl -sS -m 10 "$BASE/api/admin/lifts" -H "x-admin-token: $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
for it in d['items']:
    mark = '可删' if it['deletable'] else '不可删'
    print('   %-10s %-8s %s %s' % (it['key'], it['name'], mark, ('（' + it['deleteHint'] + '）') if it['deleteHint'] else ''))
"
echo
echo "6) 恢复后项目数：$(psql -tAc "select count(*) from lift_items;")"
