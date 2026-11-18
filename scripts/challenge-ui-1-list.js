// 挑战功能前端 pages/challenges/list：大厅
const fs = require('fs')
const DIR = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges'
fs.mkdirSync(DIR + '/list', { recursive: true })
fs.mkdirSync(DIR + '/new', { recursive: true })
fs.mkdirSync(DIR + '/detail', { recursive: true })
fs.mkdirSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/challenges', { recursive: true })

const listJs = `// 挑战大厅：所有会员都能看（公开），可以筛选我参与 / 待我应战 / 待我判决
const api = require('../../utils/api')
const sfx = require('../../utils/sfx')

const TABS = [
  { key: 'all', name: '全部' },
  { key: 'mine', name: '我参与' },
  { key: 'incoming', name: '待我应战' },
  { key: 'judging', name: '待我判决' }
]

// 倒计时文案
function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return ''
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  if (h > 0) return h + ' 小时 ' + (m % 60) + ' 分'
  return Math.max(1, m) + ' 分钟'
}

Page({
  data: {
    tabs: TABS,
    tab: 'all',
    list: [],
    loaded: false,
    loading: false,
    hasMore: true,
    counts: {}
  },

  onShow() {
    this.reload()
    // 每 30 秒刷新一次倒计时
    this.timer = setInterval(() => this.refreshCountdown(), 30 * 1000)
  },

  onHide() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  // 只刷新倒计时，不重新请求
  refreshCountdown() {
    const now = Date.now()
    const list = this.data.list.map(it => Object.assign({}, it, {
      countdownText: countdown(it.deadline),
      expired: it.deadline > 0 && it.deadline <= now
    }))
    this.setData({ list })
  },

  pickTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab, list: [], hasMore: true })
    this.load()
  },

  reload() {
    this.setData({ list: [], hasMore: true, loaded: false })
    return this.load()
  },

  load() {
    if (this.data.loading || !this.data.hasMore) return Promise.resolve()
    this.setData({ loading: true })
    const before = this.data.list.length ? this.data.list[this.data.list.length - 1].createdAt : 0
    return api.call('challengeList', { tab: this.data.tab, before }).then(r => {
      const rows = (r.list || []).map(it => Object.assign({}, it, {
        countdownText: countdown(it.deadline),
        expired: it.deadline > 0 && it.deadline <= Date.now(),
        // 卡片上的一句话状态
        line: it.status === 'pending' ? (it.opponent.isMe ? '对方在等你应战' : '等待对方应战')
          : it.status === 'waiting_referee' ? '等待裁判确认'
            : it.status === 'accepted' ? '双方上传视频中'
              : it.status === 'ready' ? '等待裁判判决'
                : it.judgeResultName || it.statusName
      }))
      this.setData({
        list: this.data.list.concat(rows),
        hasMore: rows.length >= 20,
        loading: false,
        loaded: true,
        counts: r.counts || {}
      })
    }, err => {
      this.setData({ loading: false, loaded: true })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  onReachBottom() {
    this.load()
  },

  open(e) {
    wx.navigateTo({ url: '/pages/challenges/detail?id=' + e.currentTarget.dataset.id })
  },

  goNew() {
    wx.navigateTo({ url: '/pages/challenges/new' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/challenges/list' })
  }
})
`

const listWxml = `<view class="page">
  <!-- 顶部：发起挑战 + 待办提示 -->
  <view class="challenge-head">
    <view class="grow">
      <view class="title">挑战</view>
      <view class="muted">{{counts.badge ? '有 ' + counts.badge + ' 件事等你处理' : '约一场，让教练当裁判'}}</view>
    </view>
    <button class="btn" bindtap="goNew">发起挑战</button>
  </view>

  <!-- 待办条 -->
  <view wx:if="{{counts.badge}}" class="todo-bar">
    <text wx:if="{{counts.incoming}}">待我应战 {{counts.incoming}}</text>
    <text wx:if="{{counts.toSubmit}}">待我交视频 {{counts.toSubmit}}</text>
    <text wx:if="{{counts.judgingInvite}}">裁判待接单 {{counts.judgingInvite}}</text>
    <text wx:if="{{counts.toJudge}}">待我判决 {{counts.toJudge}}</text>
  </view>

  <!-- 筛选 -->
  <view class="tabs">
    <view wx:for="{{tabs}}" wx:key="key" class="tab {{tab === item.key ? 'on' : ''}}"
      data-tab="{{item.key}}" bindtap="pickTab">{{item.name}}</view>
  </view>

  <view wx:if="{{loaded && !list.length}}" class="card muted">
    还没有挑战。点右上角「发起挑战」，选一个项目、指定一位教练当裁判，约起来。
  </view>

  <view wx:for="{{list}}" wx:key="_id" class="card challenge-card" data-id="{{item._id}}" bindtap="open">
    <view class="between">
      <view class="row" style="gap:12rpx;align-items:center">
        <text class="tag orange">{{item.liftName}}</text>
        <text class="tag">{{item.metricName}}</text>
        <text class="tag {{item.status === 'ready' || item.status === 'accepted' ? 'orange' : ''}}">{{item.statusName}}</text>
      </view>
      <text class="muted">{{item.createdDate}}</text>
    </view>

    <view class="vs-row">
      <view class="side {{item.judgeResult && item.judgeResult.indexOf('challenger') > 0 ? 'win' : ''}}">
        <text class="name">{{item.challenger.name}}</text>
      </view>
      <text class="vs">VS</text>
      <view class="side {{item.judgeResult && item.judgeResult.indexOf('opponent') > 0 ? 'win' : ''}}">
        <text class="name">{{item.opponent.name}}</text>
      </view>
    </view>

    <view wx:if="{{item.trashTalk}}" class="trash">「{{item.trashTalk}}」</view>

    <view class="between foot">
      <text class="muted">裁判：{{item.referee.name}}<text wx:if="{{item.referee.isMe}}" class="tag orange">我</text></text>
      <text wx:if="{{item.countdownText}}" class="countdown">{{item.countdownText}}</text>
      <text wx:elif="{{item.judgeResultName}}" class="result">{{item.judgeResultName}}</text>
      <text wx:else class="muted">{{item.line}}</text>
    </view>
  </view>

  <view wx:if="{{loading}}" class="list-hint">加载中…</view>
  <view wx:elif="{{loaded && !hasMore && list.length}}" class="list-hint">没有更多了</view>
</view>
`

const listWxss = `/* 挑战大厅 */
.challenge-head { display: flex; align-items: center; gap: 16rpx; margin: 8rpx 0 16rpx; }
.challenge-head .title { font-size: 34rpx; font-weight: 600; color: var(--ink); }
.todo-bar {
  display: flex; flex-wrap: wrap; gap: 16rpx;
  background: var(--brand-soft); color: var(--brand-strong);
  border-radius: var(--r-lg); padding: 14rpx 20rpx; font-size: 24rpx; margin-bottom: 16rpx;
}
.tabs { display: flex; gap: 8rpx; margin-bottom: 16rpx; }
.tab {
  flex: 1; text-align: center; font-size: 25rpx; color: var(--sub);
  background: var(--fill); border-radius: var(--r-pill); padding: 12rpx 0;
}
.tab.on { background: var(--brand); color: #fff; font-weight: 600; }
.challenge-card { display: block; }
.vs-row { display: flex; align-items: center; gap: 12rpx; margin: 14rpx 0 6rpx; }
.side { flex: 1; }
.side .name { font-size: 30rpx; font-weight: 600; color: var(--ink); }
.side.win .name { color: var(--brand); }
.vs { font-size: 22rpx; color: var(--muted); }
.trash {
  font-size: 24rpx; color: var(--sub); background: var(--fill);
  border-radius: var(--r-sm); padding: 10rpx 16rpx; margin: 10rpx 0;
}
.foot { margin-top: 12rpx; }
.countdown { font-size: 24rpx; color: var(--brand-strong); }
.result { font-size: 24rpx; color: var(--ink); font-weight: 600; }
.list-hint { text-align: center; color: var(--muted); font-size: 24rpx; padding: 20rpx 0; }
`

const listJson = JSON.stringify({
  navigationBarTitleText: '挑战',
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
}, null, 2) + '\n'

fs.writeFileSync(DIR + '/list/list.js', listJs)
fs.writeFileSync(DIR + '/list/list.wxml', listWxml)
fs.writeFileSync(DIR + '/list/list.wxss', listWxss)
fs.writeFileSync(DIR + '/list/list.json', listJson)
console.log('✓ 生成 pages/challenges/list')

require('child_process').execFileSync(process.execPath, ['--check', DIR + '/list/list.js'])
console.log('✓ 语法通过')
