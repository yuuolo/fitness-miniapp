// 挑战订阅消息：客户端授权（稳妥版：整段替换，不用碎片拼）
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

// ---------- 1. utils/subscribe.js ----------
const subscribe = `// 微信订阅消息授权（一次性）
//
// 订阅消息是「一次授权发一条」：用户点了按钮同意，之后我们才能给他发一条。
// 所以只在关键动作时申请：发起挑战 / 应战 / 交视频 / 裁判接单。
// 授权结果不影响主流程，失败静默跳过。
const CACHE_MS = 30 * 60 * 1000
let cache = { at: 0, ids: null }

function loadIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.ids)
  const api = require('./api')
  return api.call('notifyTemplates', {}, { silent: true }).then(ids => {
    cache = { at: Date.now(), ids: ids || {} }
    return cache.ids
  }, () => ({})).catch(() => ({}))
}

/**
 * 申请订阅：kinds 里传 invite / start / result
 * 同意后微信记一次额度；失败不影响后续操作。
 */
function request(kinds) {
  return loadIds().then(ids => {
    const list = []
    for (const k of kinds || []) {
      const id = ids[k]
      if (id && list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return null
    return new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: list,
        success: res => resolve(res),
        fail: () => resolve(null)
      })
    })
  }).catch(() => null)
}

module.exports = { request, loadIds }
`

fs.writeFileSync(MP + '/utils/subscribe.js', subscribe)
done.push('utils/subscribe.js')

// ---------- 2. 发起挑战：授权后再创建 ----------
edit('pages/challenges/new/new.js', t => {
  if (t.includes('subscribe.request')) return t
  t = t.replace(
    `const memberSearch = require('../../../utils/member-search')`,
    `const memberSearch = require('../../../utils/member-search')
const subscribe = require('../../../utils/subscribe')`
  )
  const from = `    this.setData({ submitting: true })
    api.call('createChallenge', {
      opponent: opponent._id,
      referee: referee._id,
      liftKey: lift.key || lift.name,
      metric: metrics[metricIndex].key,
      trashTalk: this.data.trashTalk
    }, { loading: '发送中' }).then(r => {`
  const to = `    this.setData({ submitting: true })
    // 先申请订阅授权：同意后，对方的应战 / 判定结果才能推送到微信
    subscribe.request(['invite', 'result']).then(() => api.call('createChallenge', {
      opponent: opponent._id,
      referee: referee._id,
      liftKey: lift.key || lift.name,
      metric: metrics[metricIndex].key,
      trashTalk: this.data.trashTalk
    }, { loading: '发送中' })).then(r => {`
  if (!t.includes(from)) {
    console.log('  [!] 发起挑战 submit 未匹配')
    return t
  }
  return t.replace(from, to)
}, '发起挑战：订阅授权')

// ---------- 3. 详情页：应战 / 裁判接单 / 交视频 前授权 ----------
edit('pages/challenges/detail/detail.js', t => {
  if (t.includes('subscribe.request')) return t
  t = t.replace(
    `const sfx = require('../../../utils/sfx')`,
    `const sfx = require('../../../utils/sfx')
const subscribe = require('../../../utils/subscribe')`
  )
  // 应战：先申请「判定结果」授权
  t = t.replace(
    `        api.call('respondChallenge', { id: this.data.id, decision, vetoReferee }, { loading: '处理中' })
          .then(() => { sfx.playSave(); this.load() })`,
    `        subscribe.request(['result'])
          .then(() => api.call('respondChallenge', { id: this.data.id, decision, vetoReferee }, { loading: '处理中' }))
          .then(() => { sfx.playSave(); this.load() })`
  )
  // 裁判接单：先申请「待判决提醒」授权
  t = t.replace(
    `    api.call('refereeRespond', { id: this.data.id, decision }, { loading: '处理中' })
      .then(() => this.load())`,
    `    subscribe.request(['start'])
      .then(() => api.call('refereeRespond', { id: this.data.id, decision }, { loading: '处理中' }))
      .then(() => this.load())`
  )
  // 交视频：先申请「判定结果」授权
  t = t.replace(
    `        api.uploadVideo(file.tempFilePath).then(v => {`,
    `        subscribe.request(['result']).then(() => api.uploadVideo(file.tempFilePath)).then(v => {`
  )
  return t
}, '详情页：订阅授权')

// ---------- 4. 首页：挑战模块 ----------
edit('pages/index/index.wxml', t => {
  if (t.includes("item.type === 'challenge'")) return t
  const anchor = `      <!-- 排行榜预览 -->`
  const block = `      <!-- 挑战预览 -->
      <block wx:elif="{{item.type === 'challenge' && features.rank !== false}}">
        <view class="between section-title">
          <text>会员挑战</text>
          <text class="muted" bindtap="goChallenges">全部挑战 ›</text>
        </view>
        <view class="card challenge-home" bindtap="goChallenges">
          <view wx:if="{{challengeBadge}}" class="challenge-todo">
            <text>有 {{challengeBadge}} 件事等你处理</text>
            <view class="todo-tags">
              <text wx:if="{{challengeCounts.incoming}}" class="tag orange">待应战 {{challengeCounts.incoming}}</text>
              <text wx:if="{{challengeCounts.toSubmit}}" class="tag orange">待交视频 {{challengeCounts.toSubmit}}</text>
              <text wx:if="{{challengeCounts.toJudge}}" class="tag orange">待判决 {{challengeCounts.toJudge}}</text>
              <text wx:if="{{challengeCounts.judgingInvite}}" class="tag orange">裁判待接单 {{challengeCounts.judgingInvite}}</text>
            </view>
          </view>
          <view wx:else class="muted">选个项目，约一个人，让教练当裁判</view>
          <view class="challenge-actions">
            <text class="challenge-link">进入挑战大厅 ›</text>
            <text wx:if="{{challengeActive}}" class="muted">进行中 {{challengeActive}} 场</text>
          </view>
        </view>
      </block>

      <!-- 排行榜预览 -->`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到排行榜预览锚点')
    return t
  }
  return t.replace(anchor, block)
}, '首页：挑战模块界面')

edit('pages/index/index.js', t => {
  if (t.includes('challengeBadge')) return t
  t = t.replace(
    `    momentThumbs: [],`,
    `    momentThumbs: [],
    // 会员挑战模块
    challengeBadge: 0,
    challengeCounts: {},
    challengeActive: 0,`
  )
  t = t.replace(
    `  onShow() {`,
    `  // 首页挑战模块：待办数字
  loadChallengeSummary() {
    api.call('challengeSummary', {}, { silent: true }).then(r => {
      this.setData({
        challengeBadge: (r && r.badge) || 0,
        challengeCounts: r || {},
        challengeActive: (r && r.active) || 0
      })
    }, () => {})
  },

  goChallenges() {
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  },

  onShow() {
    this.loadChallengeSummary()`
  )
  return t
}, '首页：挑战计数与方法')
