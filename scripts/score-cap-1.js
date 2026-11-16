// 身体评分：相对力量三项缺一项，最高只能拿 15 分
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. scoreBody 支持 liftCount，缺项封顶 15 分 ----------
t = t.replace(
  `function scoreBody(input) {
  const { gender, weight, height, bodyFat, sbdTotal } = input
  const detail = []
  let got = 0
  let full = 0`,
  `// sbdCount：卧推/深蹲/硬拉里录了几项（0–3）
// 三项没录全时，相对力量最多只能拿 15 分（避免只录一项就顶到满分）
const STRENGTH_CAP_PARTIAL = 15

function scoreBody(input) {
  const { gender, weight, height, bodyFat, sbdTotal, sbdCount } = input
  const detail = []
  let got = 0
  let full = 0`
)

t = t.replace(
  `  if (sbdTotal > 0 && weight > 0) {
    const ratio = sbdTotal / weight
    const target = gender === 'female' ? 2.2 : 3.0
    const s = Math.max(0, Math.min(1, ratio / target))
    detail.push({ key: 'strength', label: '相对力量', score: round(40 * s, 1), max: 40 })
    got += 40 * s
    full += 40
  }`,
  `  if (sbdTotal > 0 && weight > 0) {
    const ratio = sbdTotal / weight
    const target = gender === 'female' ? 2.2 : 3.0
    const s = Math.max(0, Math.min(1, ratio / target))
    const count = Number(sbdCount) || 0
    const missing = count < 3
    // 三项没录全时封顶 15 分
    const raw40 = 40 * s
    const capped = missing ? Math.min(raw40, STRENGTH_CAP_PARTIAL) : raw40
    detail.push({
      key: 'strength',
      label: '相对力量',
      score: round(capped, 1),
      max: 40,
      capped: missing && raw40 > STRENGTH_CAP_PARTIAL,
      note: missing ? '卧推/深蹲/硬拉未录全，本次最多 ' + STRENGTH_CAP_PARTIAL + ' 分' : ''
    })
    got += capped
    full += 40
  }`
)
done.push('scoreBody 支持缺项封顶')

// ---------- 2. 新增 sbdCountOf ----------
if (!t.includes('function sbdCountOf')) {
  t = t.replace(
    `function sbdOf(bestLift) {`,
    `// 卧推/深蹲/硬拉里录了几项（有 1RM 才计数）
function sbdCountOf(bestLift) {
  const b = bestLift || {}
  return ['bench', 'squat', 'deadlift'].filter(k => b[k] && b[k].oneRM > 0).length
}

function sbdOf(bestLift) {`
  )
  done.push('新增 sbdCountOf')
}

// ---------- 3. 三处调用都带上 sbdCount ----------
t = t.replace(
  `        bodyFat: latest.bodyFat,
        sbdTotal: sbdOf(bestLift)`,
  `        bodyFat: latest.bodyFat,
        sbdTotal: sbdOf(bestLift),
        sbdCount: sbdCountOf(bestLift)`
)
t = t.replace(
  `        bodyFat: extra.body_fat || 0,
        sbdTotal: sbdOf(target.bestLift)`,
  `        bodyFat: extra.body_fat || 0,
        sbdTotal: sbdOf(target.bestLift),
        sbdCount: sbdCountOf(target.bestLift)`
)
t = t.replace(
  `        bodyFat: latestBody.bodyFat,
        sbdTotal: sbdOf(member.bestLift)`,
  `        bodyFat: latestBody.bodyFat,
        sbdTotal: sbdOf(member.bestLift),
        sbdCount: sbdCountOf(member.bestLift)`
)
done.push('三处调用带上 sbdCount')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

// 确认三处调用都有 sbdCount
const calls = (fs.readFileSync(P, 'utf8').match(/sbdCount: sbdCountOf/g) || []).length
console.log('  已更新的调用点: ' + calls + ' / 3')
