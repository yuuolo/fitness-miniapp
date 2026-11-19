// 打开小程序自动弹「一键订阅所有提醒」；票上限提到 10（可反复订阅攒条数）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
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

// ---------- 1. 服务端：票上限 5 → 10 ----------
edit(SERVER + '/lib/notify-topics.js', t => t.replace('const MAX_TICKETS = 5', 'const MAX_TICKETS = 10'), '票上限 5 → 10')

// ---------- 2. subscribe.js：加一个「订阅所有内容提醒」的便捷方法 ----------
edit(MP + '/utils/subscribe.js', t => {
  if (t.includes('subscribeAllContent')) return t
  return t.replace(
    `module.exports = {
  prefetch, request, requestSync, requestTopics, requestTopicsSync,
  loadIds, loadTopicIds, cachedTopicIds
}`,
    `// 一次点击订阅全部内容提醒（3 个模板）
function subscribeAllContent() {
  return requestTopicsSync(['moments', 'competitions', 'rankScore', 'rankLift'])
}

module.exports = {
  prefetch, request, requestSync, requestTopics, requestTopicsSync,
  subscribeAllContent, loadIds, loadTopicIds, cachedTopicIds
}`
  )
}, 'subscribe.js：subscribeAllContent')

// ---------- 3. 首页：每次打开自动弹订阅提示（点一下才授权） ----------
edit(MP + '/pages/index/index.js', t => {
  if (t.includes('promptSubscribe')) return t
  t = t.replace(
    `const api = require('../../utils/api')`,
    `const api = require('../../utils/api')
const subscribe = require('../../utils/subscribe')`
  )
  // onShow 里加提示
  t = t.replace(
    `  onShow() {
    this.loadChallengeSummary()`,
    `  onShow() {
    this.loadChallengeSummary()
    this.promptSubscribe()`
  )
  // 方法插在 goChallenges 前
  t = t.replace(
    `  goChallenges() {`,
    `  // 打开小程序时提示订阅（微信要求必须用户点击才能弹授权，所以是「提示 + 一键订阅」）
  // 只在没有待发提醒时提示，且一天最多提示一次，避免打扰
  promptSubscribe() {
    if (this._prompted) return
    this._prompted = true
    api.call('mySubscriptions', {}, { silent: true }).then(r => {
      const topics = (r && r.topics) || {}
      const total = Object.keys(topics).reduce((n, k) => n + (Number(topics[k]) || 0), 0)
      if (total > 0) return
      const today = new Date().toISOString().slice(0, 10)
      let last = ''
      try { last = wx.getStorageSync('subscribePromptDate') || '' } catch (e) {}
      if (last === today) return
      wx.showModal({
        title: '开启微信提醒？',
        content: '友圈有新视频、竞赛有变化、排行榜更新时，会推送到你的微信。',
        confirmText: '一键订阅',
        cancelText: '以后再说',
        success: res => {
          if (!res.confirm) return
          try { wx.setStorageSync('subscribePromptDate', today) } catch (e) {}
          subscribe.subscribeAllContent().then(r2 => {
            const accepted = (r2 && r2.accepted) || []
            if (!accepted.length) {
              wx.showToast({ title: '订阅没成功，可到「我的-微信提醒」再试', icon: 'none' })
              return
            }
            wx.showToast({ title: '已订阅，有新内容会通知你' })
            this.loadSubscribeTickets && this.loadSubscribeTickets()
          })
        }
      })
    }, () => {})
  },

  goChallenges() {`
  )
  return t
}, '首页：打开时弹订阅提示')

// 首页也需要一个票数加载（我的页面已有；首页这里简单拉一下即可，用于提示判断）
edit(MP + '/pages/index/index.js', t => {
  if (t.includes('loadSubscribeTickets')) return t
  return t.replace(
    `  goChallenges() {`,
    `  loadSubscribeTickets() {
    api.call('mySubscriptions', {}, { silent: true }).then(() => {}, () => {})
  },

  goChallenges() {`
  )
}, '首页：票数占位方法')

// ---------- 4. 订阅页文案：说明可反复点攒条数 ----------
edit(MP + '/pages/subscribe/subscribe.wxml', t => t
  .replace(
    `    <view class="muted">有新内容时推到你的微信。微信规定一次授权只能收一条，想持续收就多点几次。</view>`,
    `    <view class="muted">有新内容时推到你的微信。微信规定一次授权只能收一条，想多收几条就多点几次按钮（最多攒 10 条）。</view>`
  )
  .replace(
    `      {{subscribing ? '授权中…' : (ready ? '订阅内容提醒（4 项一次搞定）' : '正在准备…')}}`,
    `      {{subscribing ? '授权中…' : (ready ? '订阅内容提醒（每点一次 +1 条）' : '正在准备…')}}`
  ), '订阅页：文案说明')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/subscribe.js', 'pages/index/index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
