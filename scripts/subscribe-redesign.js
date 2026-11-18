// 订阅管理：统一入口（我的页面），一次点击订阅全部话题；顺手修「订阅未成功」的手势问题
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

// ---------- 1. 重写 utils/subscribe.js ----------
const util = `// 微信订阅消息授权（一次性）
//
// 关键坑：wx.requestSubscribeMessage 必须由「用户点击」直接触发，
// 中间夹一个异步请求（拉模板 ID）就会报 fail（手势丢失），表现为「订阅未成功」。
// 所以模板 ID 在启动/页面加载时就预取好，用户点按钮时同步调用。
const api = require('./api')

const CACHE_MS = 30 * 60 * 1000
let cache = { at: 0, ids: null }        // 挑战模板
let topicCache = { at: 0, ids: null }   // 内容更新模板

function loadIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.ids)
  return api.call('notifyTemplates', {}, { silent: true }).then(ids => {
    cache = { at: Date.now(), ids: ids || {} }
    return cache.ids
  }, () => ({})).catch(() => ({}))
}

function loadTopicIds() {
  if (topicCache.ids && Date.now() - topicCache.at < CACHE_MS) return Promise.resolve(topicCache.ids)
  return api.call('notifyTopicTemplates', {}, { silent: true }).then(ids => {
    topicCache = { at: Date.now(), ids: ids || {} }
    return topicCache.ids
  }, () => ({})).catch(() => ({}))
}

// 启动时预热（app.js 调一次），这样点按钮时不会因为还在拉 ID 而丢失手势
function prefetch() {
  return Promise.all([loadIds(), loadTopicIds()]).catch(() => null)
}

// 读缓存（同步），拿不到返回 null
function cachedTopicIds() {
  if (!topicCache.ids) return null
  if (Date.now() - topicCache.at > CACHE_MS) return null
  return topicCache.ids
}

function cachedChallengeIds() {
  if (!cache.ids) return null
  if (Date.now() - cache.at > CACHE_MS) return null
  return cache.ids
}

// 弹一次授权（最多 3 个模板 ID，必须同步调用）
function ask(tmplIds) {
  return new Promise(resolve => {
    let done = false
    const finish = res => {
      if (done) return
      done = true
      resolve(res)
    }
    setTimeout(() => finish(null), 8000)
    try {
      wx.requestSubscribeMessage({
        tmplIds,
        success: res => finish(res),
        fail: err => {
          console.warn('requestSubscribeMessage fail', err && err.errMsg)
          finish({ __error: (err && err.errMsg) || 'requestSubscribeMessage:fail' })
        }
      })
    } catch (e) {
      finish({ __error: e.message || 'requestSubscribeMessage:exception' })
    }
  })
}

/**
 * 内容更新订阅：同步版本（必须在点击事件里直接调用）
 * topics 传 moments / competitions / rankScore / rankLift
 * 返回 Promise<{accepted, error}>；accept 后自动在服务端登记票
 */
function requestTopicsSync(topics) {
  const ids = cachedTopicIds()
  if (!ids) return Promise.resolve({ accepted: [], error: 'not-ready' })
  const list = []
  const byTmpl = {}
  for (const topic of topics || []) {
    const id = ids[topic]
    if (!id) continue
    byTmpl[id] = byTmpl[id] || []
    byTmpl[id].push(topic)
    if (list.indexOf(id) < 0) list.push(id)
  }
  if (!list.length) return Promise.resolve({ accepted: [], error: 'no-template' })

  return ask(list.slice(0, 3)).then(res => {
    if (!res) return { accepted: [], error: 'timeout' }
    if (res.__error) return { accepted: [], error: res.__error }
    const accepted = []
    for (const [tmpl, group] of Object.entries(byTmpl)) {
      if (res[tmpl] === 'accept') accepted.push(...group)
    }
    if (!accepted.length) return { accepted: [], error: 'rejected' }
    return accepted.reduce((p, topic) => p.then(() =>
      api.call('subscribeTopic', { topic }, { silent: true }).catch(() => {})
    ), Promise.resolve()).then(() => ({ accepted, error: '' }))
  })
}

// 兼容旧调用：先等模板 ID 再弹（挑战流程里用，那里不是点击直接触发也没关系）
function request(kinds) {
  return loadIds().then(ids => {
    const list = []
    for (const k of kinds || []) {
      const id = ids[k]
      if (id && list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return null
    return ask(list.slice(0, 3))
  }).catch(() => null)
}

function requestTopics(topics) {
  // 有缓存就同步走（保证手势），没缓存就先加载再试
  const cached = cachedTopicIds()
  if (cached) return requestTopicsSync(topics)
  return loadTopicIds().then(() => requestTopicsSync(topics)).catch(() => ({ accepted: [], error: 'load-failed' }))
}

module.exports = { prefetch, request, requestTopics, requestTopicsSync, loadIds, loadTopicIds, cachedTopicIds }
`

fs.writeFileSync(MP + '/utils/subscribe.js', util)
done.push('utils/subscribe.js 重写（预取 + 同步调用，修手势丢失）')

// ---------- 2. app.js 启动预热 ----------
{
  const p = MP + '/app.js'
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  if (!t.includes('subscribe.prefetch')) {
    t = t.replace(
      `const config = require('./config')`,
      `const config = require('./config')
const subscribe = require('./utils/subscribe')`
    )
    t = t.replace(
      `App({
  globalData: {
    config
  }
})`,
      `App({
  globalData: {
    config
  },

  onLaunch() {
    // 预热订阅模板 ID：用户点「订阅」时要同步调用 wx.requestSubscribeMessage，
    // 中间不能夹异步请求，否则微信会报手势丢失（表现为「订阅未成功」）
    subscribe.prefetch()
  }
})`
    )
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push('app.js 启动预热模板 ID')
  }
}

// ---------- 3. 订阅管理页 ----------
const dir = MP + '/pages/subscribe'
fs.mkdirSync(dir, { recursive: true })

const pageJs = `// 订阅提醒：一个页面管理所有微信通知（友圈视频 / 竞赛 / 综合评分榜 / 力量排行榜）
//
// 微信规则：一次授权只发一条消息。这里点一次「一键订阅」会把三种模板一次性授权，
// 授权到的每个话题各记一张票；票用完要回来再点一次。
const api = require('../../utils/api')
const subscribe = require('../../utils/subscribe')

const TOPICS = [
  { key: 'moments', name: '友圈新视频', desc: '有人发了带视频的动态' },
  { key: 'competitions', name: '竞赛动态', desc: '新竞赛发布 / 竞赛结束或取消' },
  { key: 'rankScore', name: '综合评分榜', desc: '有人录了体测、评分变了' },
  { key: 'rankLift', name: '力量排行榜', desc: '有人刷新卧推/深蹲等最好成绩' }
]

Page({
  data: {
    topics: [],
    total: 0,
    ready: false,
    subscribing: false,
    lastError: ''
  },

  onLoad() {
    // 页面一打开就预取模板 ID，保证点按钮时是同步调用
    subscribe.prefetch().then(() => this.setData({ ready: true }))
    this.loadMine()
  },

  onShow() {
    this.loadMine()
  },

  loadMine() {
    return api.call('mySubscriptions', {}, { silent: true }).then(r => {
      const tickets = (r && r.topics) || {}
      const topics = TOPICS.map(t => Object.assign({}, t, { tickets: tickets[t.key] || 0 }))
      const total = topics.reduce((n, t) => n + t.tickets, 0)
      this.setData({ topics, total })
    }, () => {})
  },

  // 一键订阅：一次点击把 3 个模板都授权（rankScore / rankLift 共用同一个模板）
  subscribeAll() {
    if (this.data.subscribing) return
    this.setData({ subscribing: true, lastError: '' })
    subscribe.requestTopicsSync(['moments', 'competitions', 'rankScore', 'rankLift']).then(r => {
      this.setData({ subscribing: false })
      const accepted = (r && r.accepted) || []
      if (!accepted.length) {
        const reason = (r && r.error) || 'unknown'
        const tip = reason === 'not-ready'
          ? '模板还在准备，稍等 2 秒再点一次'
          : reason === 'rejected'
            ? '你点了“取消”，同意后才能收到通知'
            : reason === 'no-template'
              ? '后台还没配好通知模板'
              : '订阅失败：' + reason
        this.setData({ lastError: tip })
        wx.showModal({ title: '订阅未成功', content: tip, showCancel: false })
        return
      }
      wx.showToast({ title: '订阅成功' })
      this.loadMine()
    })
  },

  // 取消某话题的所有票
  clearTopic(e) {
    const topic = e.currentTarget.dataset.topic
    const name = (TOPICS.find(t => t.key === topic) || {}).name || topic
    wx.showModal({
      title: '停止提醒',
      content: '不再接收「' + name + '」的微信提醒？（已授权的票会保留，但不再累计）',
      success: r => {
        if (!r.confirm) return
        api.call('clearSubscription', { topic }, { silent: true })
          .then(() => this.loadMine())
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }))
      }
    })
  },

  openChallenges() {
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  }
})
`

const pageWxml = `<view class="page">
  <view class="card hero-sub">
    <view class="hero-title">微信提醒</view>
    <view class="muted">授权后，有新内容会推送到你的微信。一次授权只能收一条，想持续收就多点几次。</view>
    <view class="hero-count">
      <text class="num">{{total}}</text>
      <text class="muted"> 条待发提醒</text>
    </view>
    <button class="btn block" bindtap="subscribeAll" disabled="{{subscribing}}">
      {{subscribing ? '授权中…' : '一键订阅全部提醒'}}
    </button>
    <view wx:if="{{lastError}}" class="err">{{lastError}}</view>
  </view>

  <view class="section-title">提醒内容</view>
  <view class="card">
    <view wx:for="{{topics}}" wx:key="key" class="sub-item">
      <view class="grow">
        <view class="sub-name">{{item.name}}</view>
        <view class="muted">{{item.desc}}</view>
      </view>
      <view class="sub-right">
        <text class="ticket {{item.tickets ? 'on' : ''}}">{{item.tickets}} 条</text>
        <text wx:if="{{item.tickets}}" class="clear" data-topic="{{item.key}}" bindtap="clearTopic">清零</text>
      </view>
    </view>
  </view>

  <view class="card tip-card">
    <view class="muted">说明</view>
    <view class="muted mt">· 微信订阅消息是「一次授权发一条」，这是微信的限制</view>
    <view class="muted">· 发一条消耗一张票，票用完要回来再点订阅</view>
    <view class="muted">· 挑战相关的提醒（有人挑战你、判定结果）在发起/应战时自动申请</view>
  </view>
</view>
`

const pageWxss = `/* 订阅管理 */
.hero-sub { background: linear-gradient(180deg, var(--brand-soft), var(--surface)); }
.hero-title { font-size: 34rpx; font-weight: 600; color: var(--ink); margin-bottom: 8rpx; }
.hero-count { display: flex; align-items: baseline; gap: 8rpx; margin: 18rpx 0; }
.hero-count .num { font-size: 52rpx; font-weight: 700; color: var(--brand-strong); }
.err { margin-top: 12rpx; font-size: 24rpx; color: var(--danger); }
.sub-item { display: flex; align-items: center; padding: 18rpx 0; border-bottom: 1px solid var(--line); }
.sub-item:last-child { border-bottom: none; }
.sub-name { font-size: 29rpx; font-weight: 600; color: var(--ink); }
.sub-right { display: flex; align-items: center; gap: 14rpx; }
.ticket { font-size: 24rpx; color: var(--muted); background: var(--fill); border-radius: var(--r-pill); padding: 6rpx 16rpx; }
.ticket.on { color: var(--brand-strong); background: var(--brand-soft); }
.clear { font-size: 23rpx; color: var(--muted); }
.tip-card { margin-top: 8rpx; }
`

const pageJson = JSON.stringify({ navigationBarTitleText: '微信提醒' }, null, 2) + '\n'

fs.writeFileSync(dir + '/subscribe.js', pageJs)
fs.writeFileSync(dir + '/subscribe.wxml', pageWxml)
fs.writeFileSync(dir + '/subscribe.wxss', pageWxss)
fs.writeFileSync(dir + '/subscribe.json', pageJson)
done.push('pages/subscribe/subscribe（订阅管理页）')

// ---------- 4. app.json 注册 ----------
{
  const appPath = MP + '/app.json'
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))
  if (!app.pages.includes('pages/subscribe/subscribe')) {
    const i = app.pages.indexOf('pages/mine/mine')
    app.pages.splice(i, 0, 'pages/subscribe/subscribe')
    fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
    done.push('app.json 注册订阅页')
  }
}

// ---------- 5. 我的页面加入口 ----------
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

edit('pages/mine/mine.wxml', t => {
  if (t.includes('goSubscribe')) return t
  const anchor = `      <view class="menu-item" bindtap="goManual">`
  const block = `      <view class="menu-item" bindtap="goSubscribe">
        <view class="mi mi-bell"></view><text class="grow">微信提醒</text>
        <text wx:if="{{subscribeTickets}}" class="tag orange">{{subscribeTickets}}</text>
        <text class="chevron">›</text>
      </view>
      <view class="menu-item" bindtap="goManual">`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到算法说明入口')
    return t
  }
  return t.replace(anchor, block)
}, '我的页面加微信提醒入口')

edit('pages/mine/mine.js', t => {
  if (t.includes('goSubscribe')) return t
  t = t.replace(
    `    challengeBadge: 0,`,
    `    challengeBadge: 0,
    subscribeTickets: 0,`
  )
  t = t.replace(
    `  goChallenges() {`,
    `  goSubscribe() {
    wx.navigateTo({ url: '/pages/subscribe/subscribe' })
  },

  goChallenges() {`
  )
  // onShow 里顺便拉一下票数
  t = t.replace(
    `    this.loadChallengeBadge()`,
    `    this.loadChallengeBadge()
    this.loadSubscribeTickets()`
  )
  t = t.replace(
    `  // 挑战待办红点`,
    `  // 订阅待发提醒数量
  loadSubscribeTickets() {
    api.call('mySubscriptions', {}, { silent: true }).then(r => {
      const tickets = (r && r.topics) || {}
      const total = Object.keys(tickets).reduce((n, k) => n + (Number(tickets[k]) || 0), 0)
      this.setData({ subscribeTickets: total })
    }, () => {})
  },

  // 挑战待办红点`
  )
  return t
}, '我的页面：微信提醒入口逻辑')

// ---------- 6. 移除各页面的订阅条 ----------
for (const [rel, name] of [
  ['pages/moments/moments.wxml', '友圈订阅条'],
  ['pages/competitions/competitions.wxml', '竞赛订阅条']
]) {
  edit(rel, t => {
    const re = /    <!-- 订阅提醒[^]*?<\/view>\n\n/
    if (!/订阅提醒/.test(t) && !/sub-tip/.test(t)) return t
    return t.replace(/    <!-- 订阅提醒[\s\S]*?<text class="muted">\{\{subscribed \? '已订阅' : '去订阅 ›'\}\}<\/text>\n    <\/view>\n\n/g, '')
      .replace(/    <view class="sub-tip"[\s\S]*?<\/view>\n\n/g, '')
  }, '移除：' + name)
}

edit('pages/rank/rank.wxml', t => {
  return t.replace(/    <view class="sub-row">[\s\S]*?<\/view>\n\n/, '')
}, '移除：排行榜订阅按钮')

// 移除对应 JS 方法
for (const rel of ['pages/moments/moments.js', 'pages/competitions/competitions.js', 'pages/rank/rank.js']) {
  edit(rel, t => {
    let out = t
    out = out.replace(/  \/\/ 订阅「[^」]*」微信提醒\n  subscribe\w+\(\) \{[\s\S]*?\n  \},\n\n/, '')
    out = out.replace(/  \/\/ 订阅「[^」]*」\n  subscribe\w+\(\) \{[\s\S]*?\n  \},\n\n/, '')
    out = out.replace(/  subscribeMoments\(\) \{[\s\S]*?\n  \},\n\n/, '')
    out = out.replace(/  subscribeCompetitions\(\) \{[\s\S]*?\n  \},\n\n/, '')
    out = out.replace(/  subscribeRank\(e\) \{[\s\S]*?\n  \},\n\n/, '')
    return out
  }, '清理订阅方法：' + rel.split('/')[1])
}

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/subscribe.js', 'app.js', 'pages/subscribe/subscribe.js', 'pages/mine/mine.js', 'pages/moments/moments.js', 'pages/competitions/competitions.js', 'pages/rank/rank.js']) {
  try {
    require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  } catch (e) {
    console.log('  ✗ 语法失败：' + f)
  }
}
console.log('语法检查完成')
