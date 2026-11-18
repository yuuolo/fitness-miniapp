// 修测试：STAFF 在测试里是 admin，改用普通会员验证「非裁判不能判」
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    // 只有裁判能判
    await expectFail(
      () => act('judgeChallenge', STAFF, { id: c1._id, result: 'win_challenger' }),
      '主裁判', '非裁判不能判定'
    )`
const to = `    // 只有裁判能判（用普通会员试，STAFF 在测试里是管理员，可以兜底判）
    await expectFail(
      () => act('judgeChallenge', RIVAL, { id: c1._id, result: 'win_challenger' }),
      '主裁判', '非裁判不能判定'
    )`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修判定权限用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
