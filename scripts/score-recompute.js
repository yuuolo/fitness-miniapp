// 1) 导出评分函数，2) 加一个重算脚本（旧评分用新规则刷新）
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

// ---------- 1. fitness.js 导出评分相关函数 ----------
const F = SERVER + '/lib/fitness.js'
let raw = fs.readFileSync(F, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (!t.includes('scoreBody, sbdOf, sbdCountOf,')) {
  t = t.replace(
    'module.exports = {\n  saveBodyRecord, deleteBodyRecord, saveStrength, saveActivity,',
    'module.exports = {\n  // 评分相关（重算脚本 / 测试会用到）\n  scoreBody, sbdOf, sbdCountOf, fatRange, bmiOf,\n  saveBodyRecord, deleteBodyRecord, saveStrength, saveActivity,'
  )
  fs.writeFileSync(F, CRLF ? t.replace(/\n/g, '\r\n') : t)
  done.push('fitness.js 导出评分函数')
}

// ---------- 2. 重算脚本 ----------
const scriptPath = SERVER + '/scripts/recompute-scores.js'
const script = `// 用当前评分规则重算所有会员的最新身体评分（改规则后用）
// 用法：docker compose exec server node scripts/recompute-scores.js [--dry]
const { query, pool } = require('../lib/db')
const { scoreBody, sbdOf, sbdCountOf } = require('../lib/fitness')

async function main() {
  const dry = process.argv.includes('--dry')
  const members = (await query('select openid, nick_name, gender, height, best_lift, latest_body from members')).rows
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

    const before = latest.score
    const after = scored.score
    if (before === after) { skipped++; continue }
    changed++
    console.log('  ' + (m.nick_name || m.openid.slice(0, 8)) + '：' + before + ' → ' + after)

    if (dry) continue
    const next = Object.assign({}, latest, { score: after, detail: scored.detail })
    await query('update members set latest_body = $2 where openid = $1', [m.openid, JSON.stringify(next)])
  }

  // 历史体测记录里的分数也一并刷新
  const bodies = (await query('select b.id, b.openid, b.weight, b.height, b.body_fat, b.gender, m.gender as mgender, m.height as mheight, m.best_lift, b.score, b.detail from body_records b join members m on m.openid = b.openid')).rows
  let bodyChanged = 0
  for (const b of bodies) {
    const scored = scoreBody({
      gender: b.mgender || b.gender,
      weight: b.weight,
      height: b.mheight || b.height,
      bodyFat: b.body_fat,
      sbdTotal: sbdOf(b.best_lift),
      sbdCount: sbdCountOf(b.best_lift)
    })
    if (b.score === scored.score) continue
    bodyChanged++
    if (dry) continue
    await query('update body_records set score = $2, detail = $3 where id = $1', [
      b.id, scored.score, JSON.stringify(scored.detail)
    ])
  }

  console.log('会员档案更新 ' + changed + ' 条，历史体测更新 ' + bodyChanged + ' 条，跳过 ' + skipped + ' 条' + (dry ? '（演练模式，未写入）' : ''))
}

main()
  .then(() => pool.end())
  .catch(err => { console.error(err); pool.end(); process.exit(1) })
`
fs.writeFileSync(scriptPath, script)
done.push('新增 scripts/recompute-scores.js')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', F])
require('child_process').execFileSync(process.execPath, ['--check', scriptPath])
console.log('  ✓ 语法通过')
