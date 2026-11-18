// 追加：挑战 P2（评论/点赞/挑战榜/徽章）测试
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "    ok('挑战 P1：发起/裁判/应战/视频/判定/改判/作弊禁赛/上限')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到 P1 锚点')
  process.exit(1)
}
if (t.includes('挑战 P2：评论、点赞')) {
  console.log('· 已有 P2 测试')
  process.exit(0)
}

const anchor2 = '  }'
// 在 P1 块结束（anchor 后的 3 个字符 '  }'）之后插入 P2 块
const idx = t.indexOf(anchor) + anchor.length
const closeIdx = t.indexOf('\n  }', idx)
const insertAt = closeIdx + '\n  }'.length

const block = `

  { // 会员挑战 P2：评论、点赞、挑战榜、徽章
    const C = 'openid-p2-challenger'
    const O = 'openid-p2-opponent'
    const J = 'openid-p2-judge'
    for (const id of [C, O, J]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: C, role: 'member' })
    await act('setRole', ADMIN, { openid: O, role: 'member' })
    await act('setRole', ADMIN, { openid: J, role: 'coach' })
    await act('updateProfile', C, { nickName: '挑战甲', phone: '13800001111' })
    await act('updateProfile', O, { nickName: '挑战乙', phone: '13800002222' })

    const c = await act('createChallenge', C, { opponent: O, referee: J, liftKey: 'bench' })
    await act('refereeRespond', J, { id: c._id, decision: 'accept' })
    await act('respondChallenge', O, { id: c._id, decision: 'accept' })
    await act('submitChallengeVideo', C, { id: c._id, videoUrl: 'https://gym.example.com/api/media/p2v1' })
    await act('submitChallengeVideo', O, { id: c._id, videoUrl: 'https://gym.example.com/api/media/p2v2' })

    // 评论（先发后管）
    await expectFail(() => act('commentChallenge', C, { id: c._id, content: '   ' }), '点什么', '空评论被拒')
    const afterComment = await act('commentChallenge', C, { id: c._id, content: '这把我看好乙' })
    assert.strictEqual(afterComment.length, 1)
    assert.strictEqual(afterComment[0].content, '这把我看好乙')
    assert.strictEqual(afterComment[0].authorName, '挑战甲')
    assert.ok(afterComment[0].canDelete, '自己能删自己的评论')

    // 别人不能删
    await expectFail(
      () => act('deleteChallengeComment', O, { id: afterComment[0]._id }),
      '只能删自己', '别人的评论不能删'
    )

    // 详情里能看到评论
    const detailWithComments = await act('challengeDetail', O, { id: c._id })
    assert.strictEqual(detailWithComments.comments.length, 1)
    assert.strictEqual(detailWithComments.commentCount, 1)

    // 点赞 / 取消
    const liked = await act('likeChallengeComment', O, { id: afterComment[0]._id })
    assert.strictEqual(liked[0].likeCount, 1)
    assert.strictEqual(liked[0].likedByMe, true)
    const unliked = await act('likeChallengeComment', O, { id: afterComment[0]._id })
    assert.strictEqual(unliked[0].likeCount, 0)
    assert.strictEqual(unliked[0].likedByMe, false)
    // 再次点赞，留一个赞给榜单测试
    await act('likeChallengeComment', O, { id: afterComment[0]._id })

    // 管理员可以删任意评论
    const adminDeleted = await act('deleteChallengeComment', ADMIN, { id: afterComment[0]._id })
    assert.strictEqual(adminDeleted.length, 0, '管理员删评论后列表为空')

    // 判定（记录成绩快照）：给双方造力量成绩，乙比甲高
    await act('saveStrength', J, { openid: C, lift: 'bench', weight: 40, reps: 5 })
    await act('saveStrength', J, { openid: O, lift: 'bench', weight: 80, reps: 5 })
    const judged = await act('judgeChallenge', J, { id: c._id, result: 'win_challenger', note: '甲动作更稳' })
    assert.strictEqual(judged.judgeResult, 'win_challenger')

    // 挑战榜
    const board = await act('challengeBoard', C, {})
    assert.ok(Array.isArray(board.week) && Array.isArray(board.streak) && Array.isArray(board.total))
    const mineRow = board.mine
    assert.strictEqual(mineRow.wins, 1, '赢一场后 mine.wins = 1')
    assert.strictEqual(mineRow.judged, 1)
    assert.ok(mineRow.badges.some(b => b.key === 'first_win'), '应有首胜徽章')
    assert.ok(mineRow.badges.some(b => b.key === 'giant_killer'), '成绩更低却赢了 → 以下克上徽章')
    assert.ok(board.week.some(x => x.openid === C && x.weekWins >= 1), '本周胜场榜包含自己')

    // 输的人连胜归零
    const boardO = await act('challengeBoard', O, {})
    assert.strictEqual(boardO.mine.streak, 0, '输了连胜清零')
    assert.strictEqual(boardO.mine.losses, 1)
    ok('挑战 P2：评论、点赞、挑战榜、徽章')
  }`

t = t.slice(0, insertAt) + block + t.slice(insertAt)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加入 P2 测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
