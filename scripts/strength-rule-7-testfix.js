// 修：删除力量成绩后的断言（现在相对力量记 0 分而不是消失）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  const delDetail = (delFit2.latestBody && delFit2.latestBody.detail) || []
  assert.ok(!delDetail.some(d => d.key === 'strength'), '没有力量成绩时评分不该有相对力量项')`
const to = `  const delDetail = (delFit2.latestBody && delFit2.latestBody.detail) || []
  const delStrength = delDetail.find(d => d.key === 'strength')
  assert.ok(delStrength, '删光力量成绩后相对力量项仍在')
  assert.strictEqual(delStrength.score, 0, '删光力量成绩后相对力量应记 0 分')`

if (t.includes(from)) {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已修删除成绩后的断言')
} else {
  console.log('⚠ 未匹配')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
