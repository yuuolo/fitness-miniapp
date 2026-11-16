// 评分改为动态计算：每次查看/PK 都用最新规则 + 最新成绩实时算
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 新增 withScore：用当前规则实时算一条身体数据的评分 ----------
if (!t.includes('function withScore(')) {
  t = t.replace(
    `// 重新算分（bestLift 变化时分数也要跟着变）`,
    `// 用「当前评分规则 + 当前最好成绩」实时给一条身体数据打分。
// 库里存的 score 只是缓存，展示时一律走这里，保证规则调整后立刻生效。
function withScore(member, body) {
  if (!body || !body.weight) return body
  const scored = scoreBody({
    gender: member.gender || body.gender,
    weight: body.weight,
    height: member.height || body.height,
    bodyFat: body.bodyFat,
    sbdTotal: sbdOf(member.bestLift),
    sbdCount: sbdCountOf(member.bestLift)
  })
  return Object.assign({}, body, { score: scored.score, detail: scored.detail })
}

// 重新算分（bestLift 变化时分数也要跟着变）`
  )
  done.push('新增 withScore')
}

// ---------- 2. fitnessOf 用实时评分 ----------
t = t.replace(
  `  const latest = member.latestBody || null
  // 别人没公开身体数据时，只能看到评分，看不到体重体脂
  const showBody = isSelf || !!member.isBodyPublic
  const hide = obj => Object.assign({}, obj, { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })
  return {`,
  `  const latestSrc = member.latestBody || null
  // 别人没公开身体数据时，只能看到评分，看不到体重体脂
  const showBody = isSelf || !!member.isBodyPublic
  const hide = obj => Object.assign({}, obj, { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })
  // 评分一律实时算（不读库里的旧分数）
  const latest = latestSrc ? withScore(member, latestSrc) : null
  const scoredHistory = body.map(b => withScore(member, b))
  return {`
)
t = t.replace(
  `    latestBody: latest ? (showBody ? Object.assign({}, latest) : hide(latest)) : null,
    bodyHistory: showBody ? body : body.map(hide),`,
  `    latestBody: latest ? (showBody ? latest : hide(latest)) : null,
    bodyHistory: showBody ? scoredHistory : scoredHistory.map(hide),`
)
done.push('fitnessOf 用实时评分')

// ---------- 3. 排行榜里的身体评分也实时算 ----------
t = t.replace(
  `      bodyScore: isPublic && m.latestBody ? m.latestBody.score : null,`,
  `      bodyScore: isPublic && m.latestBody ? withScore(m, m.latestBody).score : null,`
)
done.push('排行榜 bodyScore 实时算')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
