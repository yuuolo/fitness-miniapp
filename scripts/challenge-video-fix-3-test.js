// 测试：挑战视频每方最多 9 段 + 裁判代传 + 删除
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('裁判可代传、可删除')) {
  console.log('· 已有测试')
  process.exit(0)
}

const anchor = "    ok('双方确认即可先传视频（裁判未接单也不影响）')"
const idx = t.indexOf(anchor)
if (idx < 0) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
const closeIdx = t.indexOf('\n  }', idx) + '\n  }'.length

const block = `

  { // 挑战视频：每方最多 9 段 + 裁判代传 + 删除
    const VA = 'openid-vid-a'
    const VB = 'openid-vid-b'
    const VC = 'openid-vid-coach'
    for (const id of [VA, VB, VC]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: VA, role: 'member' })
    await act('setRole', ADMIN, { openid: VB, role: 'member' })
    await act('setRole', ADMIN, { openid: VC, role: 'coach' })
    await act('updateProfile', VA, { nickName: '视频甲', phone: '13800009111' })
    await act('updateProfile', VB, { nickName: '视频乙', phone: '13800009222' })

    const c = await act('createChallenge', VA, { opponent: VB, referee: VC, liftKey: 'bench' })
    await act('respondChallenge', VB, { id: c._id, decision: 'accept' })
    await act('refereeRespond', VC, { id: c._id, decision: 'accept' })

    // 同一方可以传多段
    await act('submitChallengeVideo', VA, { id: c._id, videoUrl: 'https://gym.example.com/api/media/v1' })
    const two = await act('submitChallengeVideo', VA, { id: c._id, videoUrl: 'https://gym.example.com/api/media/v2' })
    assert.strictEqual(two.videos.filter(v => v.openid === VA).length, 2, '同一方可以传多段')

    // 裁判代传乙的视频
    const proxied = await act('submitChallengeVideo', VC, { id: c._id, forOpenid: VB, videoUrl: 'https://gym.example.com/api/media/v3' })
    assert.strictEqual(proxied.videos.filter(v => v.openid === VB).length, 1, '裁判可以代传')
    const pv = proxied.videos.find(v => v.openid === VB)
    assert.strictEqual(pv.uploadedBy, VC, '要记录是裁判代传的')
    assert.strictEqual(proxied.status, 'ready', '双方都有视频后进入待判决')

    // 非裁判不能代传
    await expectFail(
      () => act('submitChallengeVideo', VA, { id: c._id, forOpenid: VB, videoUrl: 'https://gym.example.com/api/media/v4' }),
      '主裁判', '普通会员不能代传'
    )

    // 上限 9 段
    for (let i = 0; i < 7; i++) {
      await act('submitChallengeVideo', VA, { id: c._id, videoUrl: 'https://gym.example.com/api/media/m' + i })
    }
    await expectFail(
      () => act('submitChallengeVideo', VA, { id: c._id, videoUrl: 'https://gym.example.com/api/media/over' }),
      '最多', '每方最多 9 段'
    )

    // 删除自己的视频
    const mine = (await act('challengeDetail', VA, { id: c._id })).videos.find(v => v.openid === VA)
    const afterDel = await act('deleteChallengeVideo', VA, { id: mine._id })
    assert.ok(!afterDel.videos.some(v => v._id === mine._id), '可以删除自己的视频')

    ok('挑战视频：每方最多 9 段、裁判可代传、可删除')
  }`

t = t.slice(0, closeIdx) + block + t.slice(closeIdx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
