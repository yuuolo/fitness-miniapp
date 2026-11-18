// 追加：挑战功能 P1 后端测试
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('友圈支持按关键字搜索（1 个字起）和只看视频')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
if (t.includes('挑战可以发起（必须指定教练裁判）')) {
  console.log('· 已有挑战测试')
  process.exit(0)
}

const idx = t.indexOf(anchor) + anchor.length
const block = `
  { // 会员挑战（裁判制）P1
    const RIVAL = 'openid-rival'
    await ensureMember(RIVAL)
    await act('updateProfile', RIVAL, { nickName: '挑战对手', phone: '13800003344' })
    // 把 COACH 设成教练、MEMBER 设成会员
    await act('setRole', ADMIN, { openid: COACH, role: 'coach' })
    await act('setRole', ADMIN, { openid: MEMBER, role: 'member' })
    await act('setRole', ADMIN, { openid: RIVAL, role: 'member' })

    // 裁判候选只有教练
    const refs = await act('refereeOptions', MEMBER)
    assert.ok(refs.some(r => r._id === COACH), '教练应出现在裁判候选里')
    assert.ok(!refs.some(r => r._id === MEMBER), '普通会员不能当裁判')

    // 发起校验
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, liftKey: 'bench' }),
      '主裁判', '不指定裁判应被拒'
    )
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: RIVAL, liftKey: 'bench' }),
      '教练', '非教练不能当裁判'
    )
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: MEMBER, referee: COACH, liftKey: 'bench' }),
      '自己', '不能挑战自己'
    )

    // 正常发起
    const c1 = await act('createChallenge', MEMBER, {
      opponent: RIVAL, referee: COACH, liftKey: 'bench', metric: 'absolute', trashTalk: '来一场'
    })
    assert.strictEqual(c1.status, 'pending')
    assert.strictEqual(c1.referee.state, 'invited')
    assert.ok(c1.expireAt > Date.now(), '应战截止应在未来')

    // 其他会员也能看到（公开）
    const pubList = await act('challengeList', STAFF, { tab: 'all' })
    assert.ok(pubList.list.some(x => x._id === c1._id), '挑战应对所有会员可见')

    // 裁判拒绝 → 发起人重选
    const declinedByRef = await act('refereeRespond', COACH, { id: c1._id, decision: 'decline' })
    assert.strictEqual(declinedByRef.referee.state, 'declined')
    assert.ok(declinedByRef.canReinvite, '发起人应能重选裁判')
    const c1b = await act('pickReferee', MEMBER, { id: c1._id, referee: ADMIN })
    assert.strictEqual(c1b.referee.openid, ADMIN)

    // 被挑战者否决赛判 → 发起人重选
    await act('setRole', ADMIN, { openid: ADMIN, role: 'coach' })
    await act('refereeRespond', ADMIN, { id: c1._id, decision: 'accept' })
    const vetoed = await act('respondChallenge', RIVAL, { id: c1._id, decision: 'accept', vetoReferee: true })
    assert.strictEqual(vetoed.status, 'referee_vetoed')
    await act('pickReferee', MEMBER, { id: c1._id, referee: COACH })
    await act('refereeRespond', COACH, { id: c1._id, decision: 'accept' })
    const accepted = await act('respondChallenge', RIVAL, { id: c1._id, decision: 'accept' })
    assert.strictEqual(accepted.status, 'accepted', '双方确认后应进入视频阶段')
    assert.ok(accepted.submitBy > Date.now(), '视频截止应在未来')

    // 只有双方能交视频
    await expectFail(
      () => act('submitChallengeVideo', STAFF, { id: c1._id, videoUrl: 'https://x/v1.mp4' }),
      '挑战双方', '非参与者不能交视频'
    )
    // 每人最多 1 段
    await act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v1' })
    await expectFail(
      () => act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v2' }),
      '最多', '每方只能交 1 段视频'
    )
    const ready = await act('submitChallengeVideo', RIVAL, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v3' })
    assert.strictEqual(ready.status, 'ready', '双方都交了应进入待判决')
    assert.ok(ready.judgeBy > Date.now(), '裁判截止应在未来')

    // 只有裁判能判
    await expectFail(
      () => act('judgeChallenge', STAFF, { id: c1._id, result: 'win_challenger' }),
      '主裁判', '非裁判不能判定'
    )
    // 判定 + 理由
    const judged = await act('judgeChallenge', COACH, {
      id: c1._id, result: 'win_challenger', note: '发起方动作更标准'
    })
    assert.strictEqual(judged.status, 'judged')
    assert.strictEqual(judged.judgeResult, 'win_challenger')
    assert.strictEqual(judged.judgeNote, '发起方动作更标准', '判定理由要对会员可见')
    assert.ok(judged.canRejudge, '3 小时内应能改判')

    // 改判（留痕）
    const rejudged = await act('judgeChallenge', COACH, { id: c1._id, result: 'draw', note: '重看后判平' })
    assert.strictEqual(rejudged.judgeResult, 'draw')
    const c1row = (await query('select judge_history from challenges where id = $1', [c1._id])).rows[0]
    assert.strictEqual(c1row.judge_history.length, 2, '改判要留痕')

    // 作弊：判负 + 禁赛 + 累计
    const c2 = await act('createChallenge', MEMBER, { opponent: RIVAL, referee: COACH, liftKey: 'squat' })
    await act('refereeRespond', COACH, { id: c2._id, decision: 'accept' })
    await act('respondChallenge', RIVAL, { id: c2._id, decision: 'accept' })
    await act('submitChallengeVideo', MEMBER, { id: c2._id, videoUrl: 'https://gym.example.com/api/media/v4' })
    await act('submitChallengeVideo', RIVAL, { id: c2._id, videoUrl: 'https://gym.example.com/api/media/v5' })
    const cheat = await act('judgeChallenge', COACH, {
      id: c2._id, result: 'win_challenger', note: '对手视频是剪的', cheatOpenid: RIVAL
    })
    assert.strictEqual(cheat.judgeResult, 'win_challenger', '作弊方应直接判负')
    const cheatVideo = cheat.videos.find(v => v.openid === RIVAL)
    assert.strictEqual(cheatVideo.cheatFlag, true, '作弊视频要标记')
    const rivalRow = memberRow((await query('select * from members where openid = $1', [RIVAL])).rows[0])
    assert.ok(rivalRow.challengeBanUntil > Date.now(), '作弊要禁赛')
    assert.strictEqual(rivalRow.challengeCheatCount, 1, '作弊次数 +1')

    // 禁赛期间不能发起
    await expectFail(
      () => act('createChallenge', RIVAL, { opponent: MEMBER, referee: COACH, liftKey: 'bench' }),
      '禁赛', '被禁赛的人不能发起挑战'
    )

    // 同时最多 2 场
    await act('setRole', ADMIN, { openid: RIVAL, role: 'member' })
    await query('update members set challenge_ban_until = 0 where openid = $1', [RIVAL])
    const mk = () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: COACH, liftKey: 'bench' })
    await mk()
    await mk()
    await expectFail(() => mk(), '最多', '同时最多 2 场进行中的挑战')

    // 红点计数
    const summary = await act('challengeSummary', RIVAL)
    assert.ok(summary.incoming >= 2, '对手应看到 2 条待应战')
    ok('挑战 P1：发起/裁判/应战/视频/判定/改判/作弊禁赛/上限')
  }`

t = t.slice(0, idx) + block + t.slice(idx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加入挑战测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
