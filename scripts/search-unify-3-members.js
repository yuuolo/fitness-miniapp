// 员工端会员列表：改用统一搜索 mixin（js + wxml 重写）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

// ---------- 1. members.js ----------
const js = `// 员工端会员列表：与竞赛录入、友圈代发共用一套会员搜索行为
// （输入即预搜、1 个字起、300ms 防抖、空关键字给默认列表）
const api = require('../../../utils/api')
const fmt = require('../../../utils/format')
const memberSearch = require('../../../utils/member-search')

Page(Object.assign({}, memberSearch.mixin, {

  data: {
    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,
    loaded: false,
    manage: '0',
    admin: '0'
  },

  onLoad(query) {
    const q = query || {}
    this.memberLimit = 50
    this.setData({ manage: q.manage || '0', admin: q.admin || '0' })
    this.fetchMembers().then(() => this.setData({ loaded: true }))
  },

  onUnload() {
    this.stopMemberSearch()
  },

  // 页面自己的映射：补上角色名和加入时间
  mapMembers(list) {
    const limit = this.memberLimit || 50
    return (list || []).slice(0, limit).map(m => Object.assign({}, m, {
      roleName: fmt.ROLE_NAMES[m.role],
      since: fmt.fullDate(m.createdAt)
    }))
  },

  onInput(e) {
    this.memberInput(e)
  },

  onConfirm() {
    this.memberConfirm()
  },

  onSearchTap() {
    this.memberSearchNow()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  open(e) {
    const url = '/pages/staff/member/member?id=' + e.currentTarget.dataset.id +
      '&manage=' + this.data.manage + '&admin=' + this.data.admin
    wx.navigateTo({ url })
  }
}))
`

// ---------- 2. members.wxml ----------
const wxml = `<view class="page">
  <!-- 与其他会员搜索一致：输入 1 个字就开始预搜 -->
  <view class="card row">
    <input class="grow" value="{{keyword}}" bindinput="onInput" bindconfirm="onConfirm"
      confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />
    <text wx:if="{{keyword}}" class="muted" style="margin-right:12rpx" bindtap="clearKeyword">清空</text>
    <button class="btn" bindtap="onSearchTap">刷新</button>
  </view>

  <view class="hint-block">会员需先打开一次小程序才会出现在这里；没填手机号的可以让教练代填。</view>

  <view wx:if="{{memberLoading}}" class="empty">搜索中…</view>
  <view wx:elif="{{memberEmpty}}" class="empty">没有找到匹配「{{keyword}}」的会员</view>
  <view wx:elif="{{loaded && !members.length}}" class="empty">还没有会员</view>

  <view class="card" wx:if="{{members.length}}">
    <view wx:for="{{members}}" wx:key="_id" class="list-item" data-id="{{item._id}}" bindtap="open">
      <view class="grow">
        <view>{{item.nickName || '未设置昵称'}} <text wx:if="{{item.role !== 'member'}}" class="tag orange">{{item.roleName}}</text></view>
        <view class="muted">{{item.phone || '未填手机号'}} · {{item.since}} 加入</view>
      </view>
      <text class="muted">›</text>
    </view>
  </view>
</view>
`

fs.writeFileSync(MP + '/pages/staff/members/members.js', js)
done.push('members.js 重写')
fs.writeFileSync(MP + '/pages/staff/members/members.wxml', wxml)
done.push('members.wxml 重写')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/members/members.js'])
console.log('  ✓ 语法通过')
