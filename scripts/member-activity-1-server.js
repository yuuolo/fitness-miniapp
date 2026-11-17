// 服务端：删除力量成绩、会员自己录运动、删除/导入运动记录
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 删除力量成绩（仅管理员） ----------
if (!t.includes('async function deleteStrength')) {
  const anchor = '// ---------- 运动数据 ----------'
  const fn = `// 删除一条力量成绩（录错时用），删除后重算「最好成绩」与评分
async function deleteStrength({ me, data }) {
  need(me, 'admin')
  const id = String(data.id || '')
  if (!id) fail('缺少要删除的记录')

  return tx(async client => {
    const row = (await client.query('select * from strength_records where id = $1', [id])).rows[0]
    if (!row) fail('这条成绩不存在或已被删除')
    const target = memberRow((await client.query(
      'select * from members where openid = $1 for update', [row.openid]
    )).rows[0])
    if (!target) fail('会员不存在')

    await client.query('delete from strength_records where id = $1', [id])

    // 用剩下的成绩重算每个项目的最好成绩
    const rest = (await client.query(
      \`select lift, weight, reps, one_rm, date, created_at
         from strength_records where openid = $1
        order by one_rm desc\`,
      [row.openid]
    )).rows
    const bestLift = {}
    for (const r of rest) {
      const cur = bestLift[r.lift]
      const v = Number(r.one_rm) || 0
      if (!cur || v > cur.oneRM) {
        bestLift[r.lift] = {
          oneRM: v,
          weight: Number(r.weight) || 0,
          reps: Number(r.reps) || 0,
          date: r.date,
          at: Number(r.created_at) || 0
        }
      }
    }
    const sbdTotal = sbdOf(bestLift)
    const latestBody = refreshScore(target, bestLift)
    await client.query(
      'update members set best_lift = $2, sbd_total = $3, latest_body = $4 where openid = $1',
      [target._id, JSON.stringify(bestLift), sbdTotal, JSON.stringify(latestBody)]
    )

    return {
      memberName: memberLabel(target),
      removed: {
        _id: row.id, lift: row.lift, weight: Number(row.weight) || 0,
        reps: row.reps, oneRM: Number(row.one_rm) || 0, date: row.date
      },
      bestLift,
      sbdTotal,
      bodyScore: latestBody && latestBody.score !== undefined ? latestBody.score : null
    }
  })
}

${anchor}`
  t = t.replace(anchor, fn)
  done.push('新增 deleteStrength（管理员）')
}

// ---------- 2. 运动记录：会员可以自己录 ----------
const oldSave = `async function saveActivity({ me, data }) {
  need(me, 'coach')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')`

const newSave = `async function saveActivity({ me, data }) {
  need(me, 'member')
  // 会员可以给自己记；教练/管理员可以帮别人记（代录）
  const isStaff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.coach
  const targetOpenid = isStaff && data.openid ? data.openid : me._id
  const target = memberRow((await query('select * from members where openid = $1', [targetOpenid])).rows[0])
  if (!target) fail('会员不存在')`

if (!t.includes(oldSave)) {
  console.log('⚠ 未匹配 saveActivity 开头')
} else {
  t = t.replace(oldSave, newSave)
  done.push('saveActivity 开放给会员')
}

// source 默认值：员工录 staff，会员自己录 self
t = t.replace(
  `  const doc = { type: typeKey, steps: 0, distance: 0, duration: 0, calories: 0, avgHr: 0, source: data.source || 'staff' }`,
  `  const doc = {
    type: typeKey, steps: 0, distance: 0, duration: 0, calories: 0, avgHr: 0,
    source: String(data.source || (isStaff ? 'staff' : 'self')).slice(0, 24)
  }`
)

// ---------- 3. 删除运动记录 + 批量导入（给设备/手环对接用） ----------
if (!t.includes('async function deleteActivity')) {
  const anchor2 = `// ---------- 活动类型元信息 ----------`
  const fn2 = `// 删除一条运动记录：本人可以删自己的，教练/管理员可以删任何人的
async function deleteActivity({ me, data }) {
  need(me, 'member')
  const id = String(data.id || '')
  if (!id) fail('缺少要删除的记录')
  const row = (await query('select * from activity_records where id = $1', [id])).rows[0]
  if (!row) fail('记录不存在或已被删除')
  const staff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.coach
  if (!staff && row.openid !== me._id) fail('只能删除自己的运动记录')
  await query('delete from activity_records where id = $1', [id])
  return { _id: id, date: row.date, type: row.type, typeName: ACTION_NAMES[row.type] || row.type }
}

// 批量导入运动数据（手机 / 手环 / 手表 / 第三方 App 对接的统一入口）
// 每条：{ openid?, date, type, steps?, distance?, duration?, calories?, avgHr?, source, externalId? }
// 有 externalId 时按「会员 + 来源 + 外部 ID」去重，重复同步不会堆积
async function importActivity({ me, data }) {
  need(me, 'admin')
  const list = Array.isArray(data.items) ? data.items : []
  if (!list.length) fail('没有要导入的数据')
  if (list.length > 500) fail('一次最多导入 500 条')
  const now = Date.now()
  let imported = 0
  let updated = 0
  let skipped = 0

  for (const it of list) {
    const openid = String(it.openid || '')
    if (!openid) { skipped++; continue }
    const exists = await query('select 1 from members where openid = $1', [openid])
    if (!exists.rows.length) { skipped++; continue }

    const typeKey = ACTION_BY_KEY[it.type] ? it.type : 'other'
    const date = String(it.date || cnDate(now)).slice(0, 10)
    const source = String(it.source || 'import').slice(0, 24)
    const ext = String(it.externalId || '').slice(0, 80)
    const id = ext
      ? 'ar_' + openid + '_' + source + '_' + ext
      : 'ar_' + openid + '_' + date + '_' + typeKey + '_' + source

    const before = await query('select 1 from activity_records where id = $1', [id])
    const n = k => {
      const v = Number(it[k])
      return Number.isFinite(v) && v > 0 ? v : 0
    }
    await query(
      \`insert into activity_records (id, openid, date, type, steps, distance, duration, calories, avg_hr, source, external_id, operator, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (id) do update set
         date = excluded.date, type = excluded.type, steps = excluded.steps,
         distance = excluded.distance, duration = excluded.duration,
         calories = excluded.calories, avg_hr = excluded.avg_hr,
         source = excluded.source, external_id = excluded.external_id,
         created_at = excluded.created_at\`,
      [id, openid, date, typeKey, Math.round(n('steps')), n('distance'), Math.round(n('duration')),
        Math.round(n('calories')), Math.round(n('avgHr')), source, ext, 'import:' + source, now]
    )
    if (before.rows.length) updated++
    else imported++
  }

  return { imported, updated, skipped, total: list.length }
}

${anchor2}`
  t = t.replace(anchor2, fn2)
  done.push('新增 deleteActivity / importActivity')
}

// ---------- 4. 导出 ----------
t = t.replace(
  'module.exports = {\n  // 评分相关（重算脚本 / 测试会用到）',
  'module.exports = {\n  deleteStrength, deleteActivity, importActivity,\n  // 评分相关（重算脚本 / 测试会用到）'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

// 检查导出是否都在
const after = fs.readFileSync(P, 'utf8')
for (const fn of ['deleteStrength', 'deleteActivity', 'importActivity']) {
  const inExports = after.indexOf('module.exports') >= 0 && after.slice(after.indexOf('module.exports')).includes(fn)
  console.log('  导出 ' + fn + ': ' + (inExports ? '✓' : '✗'))
}
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
