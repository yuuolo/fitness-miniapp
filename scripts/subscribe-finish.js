// 收尾：铃铛图标 + clearSubscription action + 注册
const fs = require('fs')

const ROOT = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp'
const MP = ROOT + '/miniprogram'
const SERVER = ROOT + '/deploy/server'
const done = []

function edit(p, fn, label) {
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

// 1. 铃铛图标
{
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9c948c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.2 5.6-1.8 6.3-.3.4 0 1 .5 1h14.6c.5 0 .8-.6.5-1-.6-.7-1.8-2.1-1.8-6.3z"/>' +
    '<path d="M10 19.2a2.2 2.2 0 0 0 4 0"/>' +
    '</svg>'
  const b64 = Buffer.from(svg, 'utf8').toString('base64')
  edit(MP + '/pages/mine/mine.wxss', t => {
    if (t.includes('.mi-bell')) return t
    return t.replace(
      /(\.mi-duel \{ background-image: url\("data:image\/svg\+xml;base64,[^"]+"\); \}\n)/,
      '$1.mi-bell { background-image: url("data:image/svg+xml;base64,' + b64 + '"); }\n'
    )
  }, '我的页面：铃铛图标')
}

// 2. clearSubscription action
edit(SERVER + '/lib/subscriptions.js', t => {
  if (t.includes('clearSubscription')) return t
  return t.replace(
    `module.exports = { notifyTopicTemplates, subscribeTopic, mySubscriptions }`,
    `// 停止某话题提醒：把票清零
async function clearSubscription({ me, data }) {
  need(me, 'member')
  const topic = String((data && data.topic) || '')
  assertTopic(topic)
  await query(
    'update notify_subscriptions set tickets = 0, updated_at = $3 where openid = $1 and topic = $2',
    [me._id, topic, Date.now()]
  )
  return mySubscriptions({ me })
}

module.exports = { notifyTopicTemplates, subscribeTopic, mySubscriptions, clearSubscription }`
  )
}, 'subscriptions.js：clearSubscription')

// 3. 注册 action
edit(SERVER + '/index.js', t => {
  if (t.includes('clearSubscription:')) return t
  return t.replace(
    `  mySubscriptions: 'rank',`,
    `  mySubscriptions: 'rank',
  clearSubscription: 'rank',`
  )
}, 'index.js：注册 clearSubscription')

// 4. 测试：清零
edit(SERVER + '/test/run.js', t => {
  if (t.includes('clearSubscription')) return t
  const anchor = `    ok('内容更新通知：订阅票管理 + 群发容错')`
  const inject = `    // 清零：用户停止提醒
    await act('subscribeTopic', FAN, { topic: 'rankScore' })
    const cleared = await act('clearSubscription', FAN, { topic: 'rankScore' })
    assert.strictEqual(cleared.topics.rankScore, 0, '清零后票数应为 0')

` + anchor
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到订阅测试锚点')
    return t
  }
  return t.replace(anchor, inject)
}, '测试：clearSubscription')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/subscriptions.js', 'index.js', 'test/run.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/subscribe/subscribe.js'])
console.log('  ✓ 语法通过')
