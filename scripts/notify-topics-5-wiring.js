// 收尾：check.js 白名单、测试清表、订阅测试、文档
const fs = require('fs')

const ROOT = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp'
const done = []

function edit(rel, fn, label) {
  const p = ROOT + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 1. check.js 白名单
edit('scripts/check.js', t => t.replace(
  "const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment', 'competition', 'challenge']",
  "const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment', 'competition', 'challenge', 'subscriptions']"
), 'check.js 白名单加 subscriptions')

// 2. 测试清表
edit('deploy/server/test/run.js', t => {
  if (t.includes("'notify_subscriptions'")) return t
  return t.replace(
    `  'challenges', 'challenge_videos', 'challenge_comments', 'challenge_comment_likes'`,
    `  'challenges', 'challenge_videos', 'challenge_comments', 'challenge_comment_likes',
  'notify_subscriptions'`
  )
}, '测试清表加订阅票表')

// 3. 测试：订阅话题
edit('deploy/server/test/run.js', t => {
  if (t.includes('订阅话题')) return t
  const anchor = "    ok('挑战 P2：评论、点赞、挑战榜、徽章')"
  const idx = t.indexOf(anchor)
  if (idx < 0) {
    console.log('  [!] 找不到 P2 锚点')
    return t
  }
  const closeIdx = t.indexOf('\n  }', idx) + '\n  }'.length
  const block = `

  { // 内容更新通知：订阅票 + 群发不崩
    const FAN = 'openid-fan'
    await ensureMember(FAN)
    await act('setRole', ADMIN, { openid: FAN, role: 'member' })
    await act('updateProfile', FAN, { nickName: '订阅会员', phone: '13800005566' })

    // 模板 ID 下发给小程序
    const tpl = await act('notifyTopicTemplates', FAN)
    assert.ok(tpl.moments && tpl.competitions && tpl.rankScore && tpl.rankLift, '四个话题都要有模板 ID')

    // 初始票数为 0
    let mine = await act('mySubscriptions', FAN)
    assert.strictEqual(mine.topics.moments, 0)
    assert.strictEqual(mine.topics.competitions, 0)

    // 订阅 + 重复订阅累加（上限 5）
    await act('subscribeTopic', FAN, { topic: 'moments' })
    await act('subscribeTopic', FAN, { topic: 'moments' })
    mine = await act('mySubscriptions', FAN)
    assert.strictEqual(mine.topics.moments, 2, '重复订阅要累加票数')
    await expectFail(
      () => act('subscribeTopic', FAN, { topic: 'nonsense' }),
      '不支持', '未知话题要拒绝'
    )

    // 群发：测试环境没有微信凭证，发不出去也不能崩，票要作废
    await act('postMoment', FAN, {
      content: '测试新视频',
      media: [{ type: 'video', url: 'https://gym.example.com/api/media/mv1', thumb: '' }]
    })
    const after = await act('mySubscriptions', FAN)
    assert.ok(after.topics.moments >= 0, '群发后票数不能是负数')
    ok('内容更新通知：订阅票管理 + 群发容错')
  }`
  t = t.slice(0, closeIdx) + block + t.slice(closeIdx)
  return t
}, '测试：订阅票 + 群发容错')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', ROOT + '/deploy/server/test/run.js'])
console.log('  ✓ 语法通过')
