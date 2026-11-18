// 修测试：非教练裁判用独立的普通会员，裁判=对手单独断言
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: RIVAL, liftKey: 'bench' }),
      '教练', '非教练不能当裁判'
    )`
const to = `    // 裁判不能是挑战双方
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: RIVAL, liftKey: 'bench' }),
      '双方', '裁判不能是挑战双方'
    )
    // 裁判只能是教练（用独立的普通会员测）
    const NONCOACH = 'openid-noncoach'
    await ensureMember(NONCOACH)
    await act('setRole', ADMIN, { openid: NONCOACH, role: 'member' })
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: NONCOACH, liftKey: 'bench' }),
      '教练', '非教练不能当裁判'
    )`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修裁判校验用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
