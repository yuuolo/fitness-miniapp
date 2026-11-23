// 旧测试「每方只能交 1 段」已不成立 → 改成「最多 9 段」
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    // 每人最多 1 段
    await act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v1' })
    await expectFail(
      () => act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v2' }),
      '最多', '每方只能交 1 段视频'
    )`

const to = `    // 每方可以交多段（上限 9）
    await act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v1' })
    const second = await act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v2' })
    assert.strictEqual(second.videos.filter(v => v.openid === MEMBER).length, 2, '同一方可以交多段视频')`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已更新多段视频用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
