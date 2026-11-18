// 修测试：重选裁判的权限要按发起人视角判断
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    const declinedByRef = await act('refereeRespond', COACH, { id: c1._id, decision: 'decline' })
    assert.strictEqual(declinedByRef.referee.state, 'declined')
    assert.ok(declinedByRef.canReinvite, '发起人应能重选裁判')`
const to = `    const declinedByRef = await act('refereeRespond', COACH, { id: c1._id, decision: 'decline' })
    assert.strictEqual(declinedByRef.referee.state, 'declined')
    // 用发起人的视角看：应该能重选裁判
    const fromChallenger = await act('challengeDetail', MEMBER, { id: c1._id })
    assert.ok(fromChallenger.canReinvite, '发起人应能重选裁判')`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修重选用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
