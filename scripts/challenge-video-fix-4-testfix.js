// 修旧测试：STAFF 是管理员，现在按裁判代传逻辑处理
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    await expectFail(
      () => act('submitChallengeVideo', STAFF, { id: c1._id, videoUrl: 'https://x/v1.mp4' }),
      '挑战双方', '非参与者不能交视频'
    )`

const to = `    // STAFF 在测试里是管理员，会被当成「可代传」，但必须说明给哪一方
    await expectFail(
      () => act('submitChallengeVideo', STAFF, { id: c1._id, videoUrl: 'https://x/v1.mp4' }),
      '代传', '非参与者不能直接交视频（管理员需指定代传对象）'
    )`

if (!t.includes(from)) {
  console.log('⚠ 未匹配旧用例')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修旧用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
