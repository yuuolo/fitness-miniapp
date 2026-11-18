// 测试：裁判未接单时双方确认即可先传视频
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('双方确认就能先传视频')) {
  console.log('· 已有该测试')
  process.exit(0)
}

const anchor = "    ok('挑战 P1：发起/裁判/应战/视频/判定/改判/作弊禁赛/上限')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到 P1 锚点')
  process.exit(1)
}
const idx = t.indexOf(anchor)
const closeIdx = t.indexOf('\n  }', idx) + '\n  }'.length

const block = `

  { // 双方确认就能先传视频（不用等裁判接单）
    const A = 'openid-early-a'
    const B = 'openid-early-b'
    const COACH3 = 'openid-coach3'
    for (const id of [A, B, COACH3]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: A, role: 'member' })
    await act('setRole', ADMIN, { openid: B, role: 'member' })
    await act('setRole', ADMIN, { openid: COACH3, role: 'coach' })
    await act('updateProfile', A, { nickName: '早传甲', phone: '13800006611' })
    await act('updateProfile', B, { nickName: '早传乙', phone: '13800006622' })

    const c = await act('createChallenge', A, { opponent: B, referee: COACH3, liftKey: 'deadlift' })
    // 裁判还没接单，对方先应战
    const accepted = await act('respondChallenge', B, { id: c._id, decision: 'accept' })
    assert.strictEqual(accepted.status, 'waiting_referee', '裁判没接单时进入「上传视频中」')
    assert.ok(accepted.submitBy > Date.now(), '应战后视频倒计时就开始了')
    assert.strictEqual(accepted.canSubmitVideo, true, '此时双方都能上传视频')

    // 双方都能传
    const v1 = await act('submitChallengeVideo', A, { id: c._id, videoUrl: 'https://gym.example.com/api/media/e1' })
    assert.strictEqual(v1.status, 'waiting_referee', '只有一方交了还是上传中')
    const v2 = await act('submitChallengeVideo', B, { id: c._id, videoUrl: 'https://gym.example.com/api/media/e2' })
    assert.strictEqual(v2.status, 'ready', '双方交齐直接进入待判决，不用等裁判接单')
    assert.ok(v2.judgeBy > Date.now(), '判决倒计时开始')

    // 裁判这时才接单，状态保持待判决
    const ref = await act('refereeRespond', COACH3, { id: c._id, decision: 'accept' })
    assert.strictEqual(ref.status, 'ready', '裁判后接单不改状态')
    assert.strictEqual(ref.canJudge, true, '接单后可以判定')

    const judged = await act('judgeChallenge', COACH3, {
      id: c._id, result: 'win_opponent', note: '乙动作更标准'
    })
    assert.strictEqual(judged.status, 'judged')
    ok('双方确认即可先传视频（裁判未接单也不影响）')
  }`

t = t.slice(0, closeIdx) + block + t.slice(closeIdx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加「先传视频」测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
