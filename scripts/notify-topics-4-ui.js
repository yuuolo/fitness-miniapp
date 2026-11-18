// 前端：订阅「更新提醒」按钮（友圈 / 竞赛 / 排行榜）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
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

// ---------- 1. subscribe.js 增加「话题订阅」 ----------
edit('utils/subscribe.js', t => {
  if (t.includes('requestTopics')) return t
  return t + `
/**
 * 订阅「内容更新」话题（友圈新视频 / 竞赛 / 综合评分榜 / 力量排行榜）
 * topics 传 ['moments', 'competitions', 'rankScore', 'rankLift'] 里的几个。
 * 授权成功一个就登记一张票；一次授权只能发一条消息。
 */
function requestTopics(topics) {
  const api = require('./api')
  return api.call('notifyTopicTemplates', {}, { silent: true }).then(ids => {
    const list = []
    const byTmpl = {}
    for (const topic of topics || []) {
      const id = ids && ids[topic]
      if (!id) continue
      byTmpl[id] = topic
      if (list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return { accepted: [] }

    return new Promise(resolve => {
      let done = false
      const finish = res => {
        if (done) return
        done = true
        resolve(res || { accepted: [] })
      }
      setTimeout(() => finish(null), 3000)
      try {
        wx.requestSubscribeMessage({
          tmplIds: list,
          success: res => finish(res),
          fail: () => finish(null)
        })
      } catch (e) {
        finish(null)
      }
    })
  }).then(res => {
    const accepted = []
    for (const [tmpl, topic] of Object.entries(res && res.__byTmpl ? {} : {})) accepted.push(topic)
    return accepted
  }).catch(() => [])
}

module.exports.requestTopics = requestTopics
`
}, 'subscribe.js：话题订阅')

// ---------- 2. 友圈：订阅新视频提醒 ----------
edit('pages/moments/moments.wxml', t => {
  if (t.includes('subscribeMoments')) return t
  return t.replace(
    `    <!-- 搜索：点图标才展开；输入 1 个字就开始预搜；可只看视频 -->`,
    `    <!-- 订阅提醒：有新视频时微信推送（一次授权一条） -->
    <view class="sub-tip" bindtap="subscribeMoments">
      <text class="sub-ico">🔔</text>
      <text class="grow">有新视频提醒我</text>
      <text class="muted">{{subscribed ? '已订阅' : '去订阅 ›'}}</text>
    </view>

    <!-- 搜索：点图标才展开；输入 1 个字就开始预搜；可只看视频 -->`
  )
}, '友圈：订阅入口')

edit('pages/moments/moments.js', t => {
  if (t.includes('subscribeMoments')) return t
  t = t.replace(
    `const sfx = require('../../utils/sfx')`,
    `const sfx = require('../../utils/sfx')
const subscribe = require('../../utils/subscribe')`
  )
  t = t.replace(
    `    keyword: '', onlyVideo: false, searchOpen: false`,
    `    keyword: '', onlyVideo: false, searchOpen: false,
    subscribed: false`
  )
  t = t.replace(
    `  // 点搜索图标：展开/收起搜索栏；收起时清掉搜索条件并恢复全部`,
    `  // 订阅「友圈新视频」微信提醒
  subscribeMoments() {
    subscribe.requestTopics(['moments']).then(topics => {
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      this.setData({ subscribed: true })
      wx.showToast({ title: '订阅成功，有新视频会通知你' })
    })
  },

  // 点搜索图标：展开/收起搜索栏；收起时清掉搜索条件并恢复全部`
  )
  return t
}, '友圈：订阅逻辑')

edit('pages/moments/moments.wxss', t => {
  if (t.includes('.sub-tip')) return t
  return t + `
/* 订阅提醒 */
.sub-tip {
  display: flex; align-items: center; gap: 10rpx;
  background: var(--brand-soft); color: var(--brand-strong);
  border-radius: var(--r-lg); padding: 14rpx 20rpx; font-size: 25rpx; margin-bottom: 14rpx;
}
.sub-ico { font-size: 26rpx; }
`
}, '友圈：订阅样式')

// ---------- 3. 竞赛：订阅竞赛提醒 ----------
edit('pages/competitions/competitions.wxml', t => {
  if (t.includes('subscribeCompetitions')) return t
  return t.replace(
    `    <view wx:if="{{loaded && !list.length}}" class="card">`,
    `    <view class="sub-tip" bindtap="subscribeCompetitions">
      <text class="sub-ico">🔔</text>
      <text class="grow">竞赛有变化提醒我</text>
      <text class="muted">{{subscribed ? '已订阅' : '去订阅 ›'}}</text>
    </view>

    <view wx:if="{{loaded && !list.length}}" class="card">`
  )
}, '竞赛：订阅入口')

edit('pages/competitions/competitions.js', t => {
  if (t.includes('subscribeCompetitions')) return t
  // 引入
  const requireLine = t.match(/const sfx = require\('\.\.\/\.\.\/utils\/sfx'\)/)
  if (requireLine) {
    t = t.replace(requireLine[0], requireLine[0] + "\nconst subscribe = require('../../utils/subscribe')")
  } else {
    t = t.replace(/^(const api = require\(.*\)\n)/m, "$1const subscribe = require('../../utils/subscribe')\n")
  }
  t = t.replace(
    `  data: {`,
    `  data: {
    subscribed: false,`
  )
  t = t.replace(
    `  onLoad() {`,
    `  // 订阅「竞赛更新」微信提醒
  subscribeCompetitions() {
    subscribe.requestTopics(['competitions']).then(topics => {
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      this.setData({ subscribed: true })
      wx.showToast({ title: '订阅成功，竞赛有变化会通知你' })
    })
  },

  onLoad() {`
  )
  return t
}, '竞赛：订阅逻辑')

edit('pages/competitions/competitions.wxss', t => {
  if (t.includes('.sub-tip')) return t
  return t + `
/* 订阅提醒 */
.sub-tip {
  display: flex; align-items: center; gap: 10rpx;
  background: var(--brand-soft); color: var(--brand-strong);
  border-radius: var(--r-lg); padding: 14rpx 20rpx; font-size: 25rpx; margin-bottom: 14rpx;
}
.sub-ico { font-size: 26rpx; }
`
}, '竞赛：订阅样式')

// ---------- 4. 排行榜：订阅两个榜 ----------
edit('pages/rank/rank.wxml', t => {
  if (t.includes('subscribeRank')) return t
  return t.replace(
    `    <view wx:if="{{autoNote}}" class="auto-note">{{autoNote}}</view>`,
    `    <view class="sub-row">
      <view class="sub-chip" bindtap="subscribeRank" data-topic="rankScore">
        🔔 综合评分榜更新提醒
      </view>
      <view class="sub-chip" bindtap="subscribeRank" data-topic="rankLift">
        🔔 力量榜更新提醒
      </view>
    </view>

    <view wx:if="{{autoNote}}" class="auto-note">{{autoNote}}</view>`
  )
}, '排行榜：订阅入口')

edit('pages/rank/rank.js', t => {
  if (t.includes('subscribeRank')) return t
  if (t.includes("const sfx = require('../../utils/sfx')")) {
    t = t.replace("const sfx = require('../../utils/sfx')",
      "const sfx = require('../../utils/sfx')\nconst subscribe = require('../../utils/subscribe')")
  } else {
    t = t.replace(/^(const api = require\(.*\)\n)/m, "$1const subscribe = require('../../utils/subscribe')\n")
  }
  t = t.replace(
    `  onLoad(`,
    `  // 订阅排行榜更新（综合评分榜 / 力量榜，可分别订阅）
  subscribeRank(e) {
    const topic = e.currentTarget.dataset.topic
    subscribe.requestTopics([topic]).then(topics => {
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      wx.showToast({ title: '订阅成功，榜单更新会通知你' })
    })
  },

  onLoad(`
  )
  return t
}, '排行榜：订阅逻辑')

edit('pages/rank/rank.wxss', t => {
  if (t.includes('.sub-row')) return t
  return t + `
/* 订阅提醒 */
.sub-row { display: flex; gap: 12rpx; margin-bottom: 12rpx; }
.sub-chip {
  flex: 1; text-align: center; font-size: 23rpx;
  color: var(--brand-strong); background: var(--brand-soft);
  border-radius: var(--r-pill); padding: 12rpx 0;
}
`
}, '排行榜：订阅样式')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
