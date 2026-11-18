// 挑战功能前端 3/4：挑战详情（含裁判判定面板）
const fs = require('fs')
const DIR = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges/detail'

const js = `// 挑战详情：双方信息 + 视频 + 裁判判定与理由 + 各角色可做的操作
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')

function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return ''
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? h + ' 小时 ' + (m % 60) + ' 分' : Math.max(1, m) + ' 分钟'
}

Page({
  data: {
    id: '',
    c: null,
    loaded: false,
    countdownText: '',
    // 裁判判定面板
    judgeOpen: false,
    judgeResult: '',
    judgeNote: '',
    cheatOpenid: '',
    results: [
      { key: 'win_challenger', name: '发起方胜' },
      { key: 'win_opponent', name: '应战方胜' },
      { key: 'draw', name: '平局' }
    ],
    // 重新选裁判
    referees: [],
    refereeOpen: false
  },

  onLoad(query) {
    const id = (query || {}).id || ''
    this.setData({ id })
    this.load()
    this.timer = setInterval(() => this.refresh(), 30000)
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  refresh() {
    if (!this.data.c) return
    this.setData({ countdownText: countdown(this.data.c.deadline) })
  },

  load() {
    return api.call('challengeDetail', { id: this.data.id }, { silent: true }).then(c => {
      this.setData({
        c,
        loaded: true,
        countdownText: countdown(c.deadline)
      })
      wx.setNavigationBarTitle({ title: c.liftName + ' · 挑战' })
    }, err => {
      this.setData({ loaded: true })
      wx.showModal({ title: '加载失败', content: err.message || '挑战不存在', showCancel: false })
    })
  },

  // ---------- 应战 / 拒绝 / 否决裁判 ----------
  respond(e) {
    const decision = e.currentTarget.dataset.decision
    const vetoReferee = e.currentTarget.dataset.veto === '1'
    const text = decision === 'decline' ? '确定拒绝这场挑战？'
      : (vetoReferee ? '应战并否决赛判？发起人会重新选裁判。' : '确定应战？记得 2 小时内上传视频。')
    wx.showModal({
      title: decision === 'decline' ? '拒绝挑战' : '应战',
      content: text,
      success: r => {
        if (!r.confirm) return
        api.call('respondChallenge', { id: this.data.id, decision, vetoReferee }, { loading: '处理中' })
          .then(() => { sfx.playSave(); this.load() })
          .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      }
    })
  },

  // ---------- 裁判接单 / 拒绝 ----------
  refereeAct(e) {
    const decision = e.currentTarget.dataset.decision
    api.call('refereeRespond', { id: this.data.id, decision }, { loading: '处理中' })
      .then(() => this.load())
      .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  // ---------- 发起人重选裁判 ----------
  toggleRefereePicker() {
    const open = !this.data.refereeOpen
    this.setData({ refereeOpen: open })
    if (open && !this.data.referees.length) {
      api.call('refereeOptions', {}, { silent: true }).then(list => this.setData({ referees: list || [] }), () => {})
    }
  },
  pickReferee(e) {
    const r = this.data.referees[Number(e.currentTarget.dataset.index)]
    if (!r) return
    api.call('pickReferee', { id: this.data.id, referee: r._id }, { loading: '处理中' })
      .then(() => this.setData({ refereeOpen: false }), () => {}).then(() => this.load())
  },

  // ---------- 上传视频（走 /api/video，自动裁切） ----------
  uploadVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      camera: 'back',
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        wx.showLoading({ title: '上传中', mask: true })
        api.uploadVideo(file.tempFilePath).then(v => {
          wx.hideLoading()
          return api.call('submitChallengeVideo', { id: this.data.id, videoUrl: v.fileID }, { silent: true })
            .then(() => {
              sfx.playSave()
              if (v.trimmed) {
                wx.showToast({ title: '已按设定裁到 ' + v.keptSeconds + ' 秒', icon: 'none' })
              } else {
                wx.showToast({ title: '视频已提交' })
              }
              this.load()
            })
        }).catch(err => {
          wx.hideLoading()
          wx.showModal({ title: '视频提交失败', content: err.message || '请稍后重试', showCancel: false })
        })
      }
    })
  },

  playVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }] })
  },

  // ---------- 裁判判定 ----------
  openJudge() {
    const c = this.data.c
    this.setData({
      judgeOpen: !this.data.judgeOpen,
      judgeResult: c.judgeResult || '',
      judgeNote: c.judgeNote || '',
      cheatOpenid: ''
    })
  },
  pickResult(e) {
    this.setData({ judgeResult: e.currentTarget.dataset.key })
  },
  onNote(e) {
    this.setData({ judgeNote: e.detail.value })
  },
  pickCheat(e) {
    const openid = e.currentTarget.dataset.openid
    this.setData({ cheatOpenid: this.data.cheatOpenid === openid ? '' : openid })
  },
  submitJudge() {
    const { judgeResult, judgeNote, cheatOpenid } = this.data
    if (!judgeResult) return wx.showToast({ title: '先选判定结果', icon: 'none' })
    const c = this.data.c
    const cheatName = cheatOpenid === c.challenger.openid ? c.challenger.name : c.opponent.name
    wx.showModal({
      title: '确认判定',
      content: (cheatOpenid ? '将标记「' + cheatName + '」视频作弊（判负 + 禁赛），' : '') +
        '判定后 3 小时内可改判。',
      success: r => {
        if (!r.confirm) return
        api.call('judgeChallenge', {
          id: this.data.id, result: judgeResult, note: judgeNote, cheatOpenid
        }, { loading: '提交中' }).then(() => {
          sfx.playSave()
          this.setData({ judgeOpen: false })
          wx.showToast({ title: '已判定' })
          this.load()
        }).catch(err => wx.showModal({ title: '判定失败', content: err.message || '', showCancel: false }))
      }
    })
  },

  // ---------- 分享 ----------
  onShareAppMessage() {
    const c = this.data.c
    return {
      title: c ? c.challenger.name + ' VS ' + c.opponent.name + ' · ' + c.liftName + '挑战' : '会员挑战',
      path: '/pages/challenges/detail?id=' + this.data.id
    }
  }
})
`

const wxml = `<view class="page">
  <view wx:if="{{!loaded}}" class="card muted">加载中…</view>

  <block wx:if="{{loaded && c}}">
    <!-- 头部：项目 + 状态 + 倒计时 -->
    <view class="card">
      <view class="between">
        <view class="row" style="gap:12rpx;align-items:center">
          <text class="tag orange">{{c.liftName}}</text>
          <text class="tag">{{c.metricName}}</text>
          <text class="tag">{{c.statusName}}</text>
        </view>
        <text class="muted">{{c.createdTime}}</text>
      </view>

      <view class="vs-row">
        <view class="side {{c.judgeResult === 'win_challenger' ? 'win' : ''}}">
          <view class="name">{{c.challenger.name}}<text wx:if="{{c.challenger.isMe}}" class="tag orange">我</text></view>
          <view class="muted">发起方</view>
        </view>
        <text class="vs">VS</text>
        <view class="side {{c.judgeResult === 'win_opponent' ? 'win' : ''}}">
          <view class="name">{{c.opponent.name}}<text wx:if="{{c.opponent.isMe}}" class="tag orange">我</text></view>
          <view class="muted">应战方</view>
        </view>
      </view>

      <view wx:if="{{c.trashTalk}}" class="trash">「{{c.trashTalk}}」</view>

      <view class="between mt">
        <view class="muted">
          裁判：{{c.referee.name}}<text wx:if="{{c.referee.isMe}}" class="tag orange">我</text>
          <text wx:if="{{c.referee.state === 'declined'}}" class="tag">已拒绝</text>
          <text wx:elif="{{c.referee.state === 'invited' && c.status === 'pending'}}" class="tag">待接单</text>
        </view>
        <text wx:if="{{countdownText}}" class="countdown">{{countdownText}}</text>
      </view>

      <view wx:if="{{c.status === 'ready' && c.judgeBy}}" class="muted mt">裁判需在倒计时内完成判定，超时管理员兜底</view>
      <view wx:if="{{c.status === 'judged'}}" class="judge-box">
        <view class="judge-title">判定结果：{{c.judgeResultName}}</view>
        <view wx:if="{{c.judgeNote}}" class="judge-note">理由：{{c.judgeNote}}</view>
        <view wx:if="{{c.canRejudge}}" class="muted mt">3 小时内可以改判</view>
      </view>
    </view>

    <!-- 双方视频 -->
    <view class="section-title">挑战视频</view>
    <view class="card">
      <view class="video-row">
        <view class="video-side">
          <view class="muted">{{c.challenger.name}}</view>
          <block wx:for="{{c.videos}}" wx:key="_id">
            <block wx:if="{{item.openid === c.challenger.openid}}">
              <view class="video-box {{item.cheatFlag ? 'cheat' : ''}}" data-url="{{item.videoUrl}}" bindtap="playVideo">
                <text class="video-play">▶</text>
                <text wx:if="{{item.cheatFlag}}" class="cheat-tag">作弊</text>
              </view>
            </block>
          </block>
          <view wx:if="{{!c.videos.length}}" class="muted">还没上传</view>
        </view>
        <view class="video-side">
          <view class="muted">{{c.opponent.name}}</view>
          <block wx:for="{{c.videos}}" wx:key="_id">
            <block wx:if="{{item.openid === c.opponent.openid}}">
              <view class="video-box {{item.cheatFlag ? 'cheat' : ''}}" data-url="{{item.videoUrl}}" bindtap="playVideo">
                <text class="video-play">▶</text>
                <text wx:if="{{item.cheatFlag}}" class="cheat-tag">作弊</text>
              </view>
            </block>
          </block>
          <view wx:if="{{!c.videos.length}}" class="muted">还没上传</view>
        </view>
      </view>
      <view wx:if="{{c.canSubmitVideo}}" class="mt">
        <button class="btn block" bindtap="uploadVideo">
          {{c.myVideo ? '重新上传（会替换）' : '上传我的挑战视频'}}
        </button>
        <view class="muted mt">视频限制按管理页设定，超时长会自动裁切；每人只能传 1 段。</view>
      </view>
    </view>

    <!-- 待我处理 -->
    <block wx:if="{{c.canRespond}}">
      <view class="section-title">等你决定</view>
      <view class="card">
        <view class="muted">接受就上传视频（2 小时内），也可以否决赛判或直接拒绝。</view>
        <view class="row mt" style="gap:16rpx">
          <button class="btn grow" data-decision="accept" bindtap="respond">应战</button>
          <button class="btn ghost grow" data-decision="accept" data-veto="1" bindtap="respond">应战但换裁判</button>
        </view>
        <button class="btn gray block mt" data-decision="decline" bindtap="respond">拒绝挑战</button>
      </view>
    </block>

    <block wx:if="{{c.canRefereeAct}}">
      <view class="section-title">裁判待办</view>
      <view class="card">
        <view class="muted">你被指定为这场挑战的主裁判。</view>
        <view class="row mt" style="gap:16rpx">
          <button class="btn grow" data-decision="accept" bindtap="refereeAct">接受</button>
          <button class="btn gray grow" data-decision="decline" bindtap="refereeAct">拒绝</button>
        </view>
      </view>
    </block>

    <block wx:if="{{c.canReinvite}}">
      <view class="section-title">重新选裁判</view>
      <view class="card">
        <view class="muted">裁判拒绝或被对方否决了，需要重新指定一位教练。</view>
        <view class="mt">
          <view class="pick-btn {{refereeOpen ? 'on' : ''}}" bindtap="toggleRefereePicker">👤 选择教练</view>
        </view>
        <block wx:if="{{refereeOpen}}">
          <view wx:for="{{referees}}" wx:key="_id" class="list-item" data-index="{{index}}" bindtap="pickReferee">
            <view class="grow">{{item.name}}</view>
            <text class="muted">选择</text>
          </view>
        </block>
      </view>
    </block>

    <!-- 裁判判定面板 -->
    <block wx:if="{{c.canJudge}}">
      <view class="section-title">裁判判定</view>
      <view class="card">
        <button class="btn block" bindtap="openJudge">{{judgeOpen ? '收起判定面板' : '开始判定'}}</button>

        <block wx:if="{{judgeOpen}}">
          <view class="muted mt">判定结果</view>
          <view class="row mt" style="gap:12rpx">
            <view wx:for="{{results}}" wx:key="key" class="result-pill {{judgeResult === item.key ? 'on' : ''}}"
              data-key="{{item.key}}" bindtap="pickResult">{{item.name}}</view>
          </view>

          <view class="muted mt">标记作弊（可选）</view>
          <view class="row mt" style="gap:12rpx">
            <view class="cheat-pill {{cheatOpenid === c.challenger.openid ? 'on' : ''}}"
              data-openid="{{c.challenger.openid}}" bindtap="pickCheat">标{{c.challenger.name}}作弊</view>
            <view class="cheat-pill {{cheatOpenid === c.opponent.openid ? 'on' : ''}}"
              data-openid="{{c.opponent.openid}}" bindtap="pickCheat">标{{c.opponent.name}}作弊</view>
          </view>
          <view wx:if="{{cheatOpenid}}" class="muted mt">作弊方直接判负，并禁赛 7 天（累计 3 次升到 30 天）</view>

          <view class="muted mt">判定理由（所有会员可见）</view>
          <textarea class="textarea" value="{{judgeNote}}" maxlength="100" bindinput="onNote"
            placeholder="例如：动作标准、深度够，判定发起方胜" />

          <button class="btn block mt" bindtap="submitJudge" disabled="{{!judgeResult}}">提交判定</button>
        </block>
      </view>
    </block>

    <view class="share-tip muted">点右上角「···」转发，邀请大家来看这场挑战</view>
  </block>
</view>
`

const wxss = `/* 挑战详情 */
.vs-row { display: flex; align-items: center; gap: 12rpx; margin: 20rpx 0 8rpx; }
.side { flex: 1; }
.side .name { font-size: 32rpx; font-weight: 600; color: var(--ink); }
.side.win .name { color: var(--brand); }
.vs { font-size: 22rpx; color: var(--muted); }
.trash {
  font-size: 26rpx; color: var(--sub); background: var(--fill);
  border-radius: var(--r-sm); padding: 12rpx 18rpx; margin: 12rpx 0;
}
.countdown { font-size: 26rpx; color: var(--brand-strong); font-weight: 600; }
.judge-box {
  margin-top: 16rpx; background: var(--brand-soft); border-radius: var(--r-lg); padding: 16rpx 20rpx;
}
.judge-title { font-size: 30rpx; font-weight: 600; color: var(--brand-strong); }
.judge-note { font-size: 26rpx; color: var(--sub); margin-top: 6rpx; }
.video-row { display: flex; gap: 20rpx; }
.video-side { flex: 1; text-align: center; }
.video-box {
  margin-top: 10rpx; height: 200rpx; border-radius: var(--r-md);
  background: var(--fill); display: flex; align-items: center; justify-content: center;
  position: relative;
}
.video-box.cheat { outline: 3rpx solid var(--danger); }
.video-play { font-size: 44rpx; color: var(--brand); }
.cheat-tag {
  position: absolute; right: 8rpx; bottom: 8rpx; font-size: 22rpx;
  background: var(--danger); color: #fff; border-radius: var(--r-pill); padding: 2rpx 12rpx;
}
.pick-btn {
  display: inline-flex; align-items: center; gap: 6rpx;
  font-size: 26rpx; color: var(--brand-strong); background: var(--fill);
  border-radius: var(--r-pill); padding: 10rpx 22rpx;
}
.pick-btn.on { background: var(--brand); color: #fff; }
.result-pill {
  flex: 1; text-align: center; font-size: 26rpx; color: var(--sub);
  background: var(--fill); border-radius: var(--r-pill); padding: 14rpx 0;
}
.result-pill.on { background: var(--brand); color: #fff; font-weight: 600; }
.cheat-pill {
  flex: 1; text-align: center; font-size: 24rpx; color: var(--sub);
  background: var(--fill); border-radius: var(--r-pill); padding: 12rpx 0;
}
.cheat-pill.on { background: var(--danger); color: #fff; }
.share-tip { text-align: center; font-size: 24rpx; margin: 24rpx 0 8rpx; }
`

const json = JSON.stringify({
  navigationBarTitleText: '挑战详情',
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
}, null, 2) + '\n'

fs.writeFileSync(DIR + '/detail.js', js)
fs.writeFileSync(DIR + '/detail.wxml', wxml)
fs.writeFileSync(DIR + '/detail.wxss', wxss)
fs.writeFileSync(DIR + '/detail.json', json)
console.log('✓ 生成 pages/challenges/detail')
require('child_process').execFileSync(process.execPath, ['--check', DIR + '/detail.js'])
console.log('✓ 语法通过')
