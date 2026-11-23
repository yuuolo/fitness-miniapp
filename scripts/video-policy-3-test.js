// 测试：挑战视频段数跟随管理页 maxCount 设定
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('用户设定为准')) {
  console.log('· 已有该测试')
  process.exit(0)
}

const anchor = "    ok('挑战视频：每方最多 9 段、裁判可代传、可删除')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}

const inject = `${anchor}

    // 段数上限跟随管理页设定：改成 3 后第 4 段应被拒
    const limitsLib = require('../lib/limits')
    await limitsLib.save({ maxCount: 3 }, 'test')
    const cur = await act('challengeDetail', VA, { id: c._id })
    assert.strictEqual(cur.videoLimit, 3, '详情里的上限要跟管理页一致')
    await expectFail(
      () => act('submitChallengeVideo', VA, { id: c._id, videoUrl: 'https://gym.example.com/api/media/over2' }),
      '最多 3 段', '超出管理页设定的段数要被拒'
    )
    await limitsLib.save({ maxCount: 9 }, 'test')
    ok('挑战视频段数以管理页 maxCount 设定为准')`

t = t.replace(anchor, inject)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加 maxCount 跟随测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
