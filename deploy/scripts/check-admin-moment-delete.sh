#!/usr/bin/env bash
# 验证：管理员能否删除别人的友圈动态（隔离库）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists gym_moment_check;" -c "create database gym_moment_check;" >/dev/null 2>&1

docker run --rm --network gym_default \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym_moment_check" \
  gym-server node -e '
const { ensureSchema, query } = require("./lib/db")
const moment = require("./lib/moment")
const { memberRow } = require("./lib/common")

async function act(fn, openid, data) {
  const me = memberRow((await query("select * from members where openid = $1", [openid])).rows[0])
  return fn({ openid, me, data: data || {} })
}
async function addMember(openid, nick, phone, role) {
  await query(
    "insert into members (openid, nick_name, phone, role, created_at) values ($1,$2,$3,$4,$5)",
    [openid, nick, phone, role, Date.now()]
  )
}

;(async () => {
  await ensureSchema()
  await addMember("m-member", "小明", "13800001111", "member")
  await addMember("m-coach", "王教练", "13800002222", "coach")
  await addMember("m-admin", "店长", "13800003333", "admin")

  // 会员发一条动态
  const posted = await act(moment.postMoment, "m-member", { content: "今天练了腿" })
  const id = posted._id
  console.log("动态已发布: " + id)

  // 各角色看 canDelete
  for (const [openid, label] of [["m-member", "作者本人"], ["m-coach", "教练"], ["m-admin", "管理员"]]) {
    const d = await act(moment.momentDetail, openid, { id })
    console.log("  " + label + " canDelete = " + d.canDelete)
  }

  // 教练尝试删除 → 应被拒绝
  try {
    await act(moment.deleteMoment, "m-coach", { id })
    console.log("  ✗ 教练竟然删成功了")
  } catch (e) {
    console.log("  ✓ 教练删除被拒: " + e.message)
  }

  // 管理员删除别人的 → 应成功
  try {
    await act(moment.deleteMoment, "m-admin", { id })
    const row = (await query("select status from moments where id = $1", [id])).rows[0]
    console.log("  " + (row.status === "deleted" ? "✓ 管理员删除成功，状态=" + row.status : "✗ 状态不对: " + row.status))
  } catch (e) {
    console.log("  ✗ 管理员删除失败: " + e.message)
  }

  process.exit(0)
})()
' 2>&1 | tail -12

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists gym_moment_check;" >/dev/null 2>&1
