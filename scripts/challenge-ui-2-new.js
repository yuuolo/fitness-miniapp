// 挑战功能前端 2/4：发起挑战页
const fs = require('fs')
const DIR = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges/new'

const js = `// 发起挑战：选对手 → 选项目/比法 → 指定教练裁判 → 写上垃圾话
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const memberSearch = require('../../../utils/member-search')

Page(Object.assign({}, memberSearch.mixin, {

  data: {
    // 对手
    keyword: '', members: [], memberLoading: false, memberEmpty: false, memberOpen: false,
    opponent: null,
    // 裁判
    referees: [], refereeIndex: -1, refereeOpen: false, referee: null,
    // 项目与比法
    lifts: [], liftIndex: 0,
    metrics: [
      { key: 'absolute', name: '绝对成绩', desc: '直接比重量/次数' },
      { key: 'relative', name: '相对体重', desc: '成绩 ÷ 体重，体重小的不吃亏' }
    ],
    metricIndex: 0,
    trashTalk: '',
    submitting: false
  },

  onLoad() {
    this.memberLimit = 20
    this.fetchMembers()
    api.call('listLiftItems', {}, { silent: true }).then(r => {
      const lifts = (r.items || r || []).filter(x => x.enabled !== false)
      this.setData({ lifts, liftIndex: 0 })
    }, () => {})
    api.call('refereeOptions', {}, { silent: true }).then(list => {
      this.setData({ referees: list || [] })
    }, () => {})
  },

  onUnload() {
    this.stopMemberSearch()
  },

  // ---------- 对手 ----------
  toggleMemberOpen() {
    this.setData({ memberOpen: !this.data.memberOpen })
    if (this.data.memberOpen && !(this.data.members || []).length) this.fetchMembers()
  },
  onKeyword(e) { this.memberInput(e) },
  clearKeyword() { this.clearMemberSearch() },
  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ opponent: m, memberOpen: false })
  },
  clearOpponent() {
    this.setData({ opponent: null, memberOpen: false })
  },

  // ---------- 裁判 ----------
  toggleReferee() {
    this.setData({ refereeOpen: !this.data.refereeOpen })
  },
  pickReferee(e) {
    const i = Number(e.currentTarget.dataset.index)
    const r = this.data.referees[i]
    if (!r) return
    this.setData({ referee: r, refereeIndex: i, refereeOpen: false })
  },
  clearReferee() {
    this.setData({ referee: null, refereeIndex: -1 })
  },

  // ---------- 其它 ----------
  onLift(e) { this.setData({ liftIndex: Number(e.detail.value) }) },
  onMetric(e) { this.setData({ metricIndex: Number(e.detail.value) }) },
  onTrash(e) { this.setData({ trashTalk: e.detail.value }) },

  submit() {
    const { opponent, referee, lifts, liftIndex, metrics, metricIndex } = this.data
    if (!opponent) return wx.showToast({ title: '先选一个对手', icon: 'none' })
    if (!referee) return wx.showToast({ title: '必须指定一名教练当裁判', icon: 'none' })
    const lift = lifts[liftIndex]
    if (!lift) return wx.showToast({ title: '请选择挑战项目', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    api.call('createChallenge', {
      opponent: opponent._id,
      referee: referee._id,
      liftKey: lift.key || lift.name,
      metric: metrics[metricIndex].key,
      trashTalk: this.data.trashTalk
    }, { loading: '发送中' }).then(r => {
      sfx.playSave()
      wx.showToast({ title: '挑战已发出' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/challenges/detail?id=' + r._id })
      }, 500)
    }).catch(err => {
      this.setData({ submitting: false })
      wx.showModal({ title: '发起失败', content: err.message || '请稍后重试', showCancel: false })
    })
  }
}))
`

const wxml = `<view class="page">
  <view class="section-title">挑战对象</view>
  <view class="card">
    <view wx:if="{{opponent}}" class="between">
      <view class="row" style="gap:12rpx;align-items:center">
        <text class="pick-name">{{opponent.name}}</text>
        <text class="muted">{{opponent.phone || ''}}</text>
      </view>
      <text class="muted" bindtap="clearOpponent">更换</text>
    </view>
    <view wx:else class="between">
      <text class="muted">还没选对手</text>
      <view class="pick-btn {{memberOpen ? 'on' : ''}}" bindtap="toggleMemberOpen">👤 选择会员</view>
    </view>

    <block wx:if="{{memberOpen}}">
      <view class="row mt">
        <input class="grow" value="{{keyword}}" bindinput="onKeyword" bindconfirm="clearKeyword"
          confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />
        <text wx:if="{{keyword}}" class="muted" bindtap="clearKeyword">清空</text>
      </view>
      <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>
      <view wx:elif="{{memberEmpty}}" class="muted mt">没有找到匹配「{{keyword}}」的会员</view>
      <view wx:if="{{members.length}}" class="mt">
        <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pickMember">
          <view class="grow">
            <view>{{item.name}}</view>
            <view class="muted">{{item.phone || '未填手机号'}}</view>
          </view>
          <text class="muted">选择</text>
        </view>
      </view>
    </block>
  </view>

  <view class="section-title">主裁判（必须是教练）</view>
  <view class="card">
    <view wx:if="{{referee}}" class="between">
      <view class="row" style="gap:12rpx;align-items:center">
        <text class="pick-name">{{referee.name}}</text>
        <text class="tag orange">教练</text>
        <text wx:if="{{referee.cheatCount}}" class="tag">曾判作弊 {{referee.cheatCount}} 次</text>
      </view>
      <text class="muted" bindtap="clearReferee">更换</text>
    </view>
    <view wx:else class="between">
      <text class="muted">还没选裁判</text>
      <view class="pick-btn {{refereeOpen ? 'on' : ''}}" bindtap="toggleReferee">👤 选择教练</view>
    </view>

    <block wx:if="{{refereeOpen}}">
      <view wx:if="{{!referees.length}}" class="muted mt">还没有教练账号，先让管理员设置教练角色</view>
      <view wx:if="{{referees.length}}" class="mt">
        <view wx:for="{{referees}}" wx:key="_id" class="list-item" data-index="{{index}}" bindtap="pickReferee">
          <view class="grow">
            <view>{{item.name}}</view>
            <view wx:if="{{item.cheatCount}}" class="muted">历史判作弊 {{item.cheatCount}} 次</view>
          </view>
          <text class="muted">选择</text>
        </view>
      </view>
    </block>
  </view>

  <view class="section-title">挑战内容</view>
  <view class="card">
    <view class="form-row">
      <text class="label">项目</text>
      <picker range="{{lifts}}" range-key="name" value="{{liftIndex}}" bindchange="onLift">
        <view class="picker-text">{{lifts[liftIndex].name}} ›</view>
      </picker>
    </view>
    <view class="form-row">
      <text class="label">比法</text>
      <picker range="{{metrics}}" range-key="name" value="{{metricIndex}}" bindchange="onMetric">
        <view class="picker-text">{{metrics[metricIndex].name}} ›</view>
      </picker>
    </view>
    <view class="muted">{{metrics[metricIndex].desc}}</view>

    <view class="form-row mt">
      <text class="label">垃圾话</text>
      <input value="{{trashTalk}}" maxlength="20" bindinput="onTrash" placeholder="选填，最多 20 字" />
    </view>
  </view>

  <view class="card rule">
    <view class="muted">规则速览</view>
    <view class="muted mt">· 对方 2 小时内应战，超时失效</view>
    <view class="muted">· 应战后双方各传 1 段视频，2 小时内交齐</view>
    <view class="muted">· 视频交齐后 2 小时内裁判判定，3 小时内可改判</view>
    <view class="muted">· 每人同时最多 2 场挑战</view>
  </view>

  <button class="btn block" bindtap="submit" disabled="{{submitting}}">发出挑战</button>
</view>
`

const wxss = `/* 发起挑战 */
.pick-btn {
  display: inline-flex; align-items: center; gap: 6rpx;
  font-size: 26rpx; color: var(--brand-strong); background: var(--fill);
  border-radius: var(--r-pill); padding: 10rpx 22rpx;
}
.pick-btn.on { background: var(--brand); color: #fff; }
.pick-name { font-size: 30rpx; font-weight: 600; color: var(--ink); }
.rule { margin-top: 16rpx; }
`

const json = JSON.stringify({ navigationBarTitleText: '发起挑战' }, null, 2) + '\n'

fs.writeFileSync(DIR + '/new.js', js)
fs.writeFileSync(DIR + '/new.wxml', wxml)
fs.writeFileSync(DIR + '/new.wxss', wxss)
fs.writeFileSync(DIR + '/new.json', json)
console.log('✓ 生成 pages/challenges/new')
require('child_process').execFileSync(process.execPath, ['--check', DIR + '/new.js'])
console.log('✓ 语法通过')
