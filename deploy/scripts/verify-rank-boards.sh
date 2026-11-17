#!/usr/bin/env bash
# 验证：综合评分榜接口 + 力量榜自动挑最近更新的项目
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
MEMBER=o5bjc4qI1ME8eNUtWE09sLqOE4aE

docker rm -f gym-rankcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-rankcheck --network gym_default -p 127.0.0.1:3044:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=rank-token -e WX_APPID=x -e WX_SECRET=x \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3044/health >/dev/null 2>&1 && break; sleep 1; done

call() {
  curl -sS -X POST http://127.0.0.1:3044/api -H 'content-type: application/json' -H 'x-dev-token: rank-token' \
    --data-binary "{\"action\":\"leaderboard\",\"code\":\"dev:$MEMBER\",\"data\":$1}"
}

echo '=== 1. 综合评分榜 ==='
call '{"lift":"score"}' | python3 -c '
import sys, json
d = json.load(sys.stdin)
x = d.get("data") or {}
print("  榜单:", x.get("liftName"), "｜单位:", x.get("unit"), "｜人数:", x.get("total"))
for r in (x.get("top") or []):
    print("   %d. %s %s 分%s" % (r["rank"], r["name"], r["value"], "（我）" if r.get("isMe") else ""))
print("  项目列表:", [l["name"] for l in (x.get("lifts") or [])])
print("  我的排名:", (x.get("me") or {}).get("rank"))
'

echo '=== 2. 力量榜：不指定项目时自动挑「最近有更新」的 ==='
call '{"period":"week"}' | python3 -c '
import sys, json
d = json.load(sys.stdin)
x = d.get("data") or {}
print("  自动选中:", x.get("liftName"), "｜autoPicked:", x.get("autoPicked"), "｜单位:", x.get("unit"))
for r in (x.get("top") or [])[:3]:
    print("   %d. %s %s %s" % (r["rank"], r["name"], r["value"], x.get("unit")))
'

docker rm -f gym-rankcheck >/dev/null 2>&1 || true
