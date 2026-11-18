#!/usr/bin/env bash
# 诊断布局测试的 6 vs 7
set -uo pipefail
cd /opt/gym
echo '=== 测试文件里的断言 ==='
grep -n 'member.length' server/test/layout.js
echo
echo '=== 默认布局实际内容 ==='
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker run --rm --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym_layout" \
  gym-server node -e '
const l = require("/app/lib/layout")
const d = l.defaults()
console.log("member:", d.member.map(b => b.type).join(","))
console.log("member 长度:", d.member.length)
console.log("coach:", d.coach.map(b => b.type).join(","))
console.log("admin:", d.admin.map(b => b.type).join(","))
'
