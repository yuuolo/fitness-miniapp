// bodyTrend 的趋势点也用实时评分
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('scoredList')) {
  console.log('· 已改过')
  process.exit(0)
}

// 1. 在 list 之后插入实时评分
const anchor = '  )).rows.map(bodyRow)\n\n  const metrics = '
if (!t.includes(anchor)) {
  console.log('⚠ 未匹配 bodyTrend 的 list 结尾')
  process.exit(1)
}
t = t.replace(
  anchor,
  `  )).rows.map(bodyRow)
  // 趋势里的评分也实时算（不读库里的旧分数）
  const trendMember = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  const scoredList = trendMember ? list.map(b => withScore(trendMember, b)) : list

  const metrics = `
)

// 2. 用 scoredList
t = t.replace('  const first = list[0]\n  const last = list[list.length - 1]',
  '  const first = scoredList[0]\n  const last = scoredList[scoredList.length - 1]')
t = t.replace('  if (first && last && list.length > 1) {', '  if (first && last && scoredList.length > 1) {')
t = t.replace('    count: list.length,', '    count: scoredList.length,')
t = t.replace('    points: list.map(r => {', '    points: scoredList.map(r => {')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ bodyTrend 改为实时评分')

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')

const check = fs.readFileSync(P, 'utf8')
for (const kw of ['scoredList', 'trendMember']) {
  const n = (check.match(new RegExp(kw, 'g')) || []).length
  console.log('  ' + kw + ': ' + n + ' 处')
}
