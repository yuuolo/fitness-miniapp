// 修测试：不要改 ADMIN 的角色，另建一个教练 COACH2
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    const c1b = await act('pickReferee', MEMBER, { id: c1._id, referee: ADMIN })
    assert.strictEqual(c1b.referee.openid, ADMIN)

    // 被挑战者否决赛判 → 发起人重选
    await act('setRole', ADMIN, { openid: ADMIN, role: 'coach' })
    await act('refereeRespond', ADMIN, { id: c1._id, decision: 'accept' })`

const to = `    // 换一个教练当裁判（另建 COACH2，不动 ADMIN 的角色）
    const COACH2 = 'openid-coach2'
    await ensureMember(COACH2)
    await act('updateProfile', COACH2, { nickName: '二号教练', phone: '13800002233' })
    await act('setRole', ADMIN, { openid: COACH2, role: 'coach' })
    const c1b = await act('pickReferee', MEMBER, { id: c1._id, referee: COACH2 })
    assert.strictEqual(c1b.referee.openid, COACH2)

    // 被挑战者否决赛判 → 发起人重选
    await act('refereeRespond', COACH2, { id: c1._id, decision: 'accept' })`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已改用独立教练 COACH2')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
