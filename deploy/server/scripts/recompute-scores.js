// 用当前评分规则重算身体评分（改规则后用）
// 用法：docker compose exec server node scripts/recompute-scores.js [--dry]
//
// 说明：
// - 会员档案（latest_body）用「当前最好成绩」重算
// - 历史体测记录用「测量当时已有的力量成绩」重算（不能用今天的成绩，否则会篡改历史）
const { query, pool } = require('../lib/db')
const { scoreBody, sbdOf, sbdCountOf } = require('../lib/fitness')

const LIFTS = ['bench', 'squat', 'deadlift']

function bestLiftAt(records, at) {
  const out = {}
  for (const r of records) {
    if (r.created_at > at) break
    if (!LIFTS.includes(r.lift)) continue
    const v = Number(r.one_rm) || 0
    if (!v) continue
    if (!out[r.lift] || v > out[r.lift].oneRM) out[r.lift] = { oneRM: v }
  }
  return out
}

async function main() {
  const dry = process.argv.includes('--dry')
  const log = []

  // 所有力量成绩，按人会话内升序（用于还原「当时的最好成绩」）
  const strengthRows = (await query(
    'select openid, lift, one_rm, created_at from strength_records order by openid, created_at asc'
  )).rows
  const byOpenid = {}
  for (const r of strengthRows) {
    ;(byOpenid[r.openid] = byOpenid[r.openid] || []).push(r)
  }

  // ---------- 1. 会员档案 ----------
  const members = (await query(
    'select openid, nick_name, gender, height, best_lift, latest_body from members'
  )).rows
  let changed = 0
  let skipped = 0
  for (const m of members) {
    const latest = m.latest_body
    if (!latest || !latest.weight) { skipped++; continue }
    const scored = scoreBody({
      gender: m.gender || latest.gender,
      weight: latest.weight,
      height: m.height || latest.height,
      bodyFat: latest.bodyFat,
      sbdTotal: sbdOf(m.best_lift),
      sbdCount: sbdCountOf(m.best_lift)
    })
    if (latest.score === scored.score) { skipped++; continue }
    changed++
    log.push('  档案 ' + (m.nick_name || m.openid.slice(0, 8)) + '：' + latest.score + ' → ' + scored.score)
    if (dry) continue
    const next = Object.assign({}, latest, { score: scored.score, detail: scored.detail })
    await query('update members set latest_body = $2 where openid = $1', [m.openid, JSON.stringify(next)])
  }

  // ---------- 2. 历史体测记录（按当时的成绩） ----------
  const bodies = (await query(
    `select b.id, b.openid, b.date, b.measured_at, b.weight, b.height, b.body_fat, b.gender,
            b.score, m.gender as mgender, m.height as mheight
       from body_records b join members m on m.openid = b.openid`
  )).rows
  let bodyChanged = 0
  for (const b of bodies) {
    const records = byOpenid[b.openid] || []
    const at = Number(b.measured_at) || 0
    const bestThen = bestLiftAt(records, at)
    const scored = scoreBody({
      gender: b.mgender || b.gender,
      weight: b.weight,
      height: b.mheight || b.height,
      bodyFat: b.body_fat,
      sbdTotal: sbdOf(bestThen),
      sbdCount: sbdCountOf(bestThen)
    })
    if (b.score === scored.score) continue
    bodyChanged++
    log.push('  体测 ' + b.date + '：' + b.score + ' → ' + scored.score + '（当时 ' + sbdCountOf(bestThen) + '/3 项力量）')
    if (dry) continue
    await query('update body_records set score = $2, detail = $3 where id = $1', [
      b.id, scored.score, JSON.stringify(scored.detail)
    ])
  }

  if (log.length) console.log(log.join('\n'))
  console.log('会员档案更新 ' + changed + ' 条，历史体测更新 ' + bodyChanged + ' 条，跳过 ' + skipped + ' 条' +
    (dry ? '（演练模式，未写入）' : ''))
}

main()
  .then(() => pool.end())
  .catch(err => { console.error(err); pool.end(); process.exit(1) })
