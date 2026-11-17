// 竞赛录入页 wxml：搜索区与其它页面一致（输入即搜、清空、空结果提示、重新选择）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/competition-entry/competition-entry.wxml'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  <view class="card">
    <view class="muted">选择会员</view>
    <view class="row mt">
      <input class="grow" value="{{keyword}}" bindinput="onKeyword" placeholder="手机号后 4 位或昵称" />
      <button class="btn" bindtap="search">搜索</button>
    </view>

    <view wx:if="{{picked}}" class="picked mt">
      已选择：<text class="title">{{picked.nickName || picked.phone}}</text>
      <text wx:if="{{picked.phone}}" class="muted">（{{picked.phone}}）</text>
    </view>

    <view wx:if="{{members.length && !picked}}" class="mt">
      <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pick">
        <view class="grow">
          <view>{{item.nickName || '未命名会员'}}</view>
          <view class="muted">{{item.phone || '未填手机号'}} · {{item.role}}</view>
        </view>
        <text class="muted">选择</text>
      </view>
    </view>
  </view>`

const to = `  <view class="card">
    <view class="muted">选择会员</view>
    <!-- 与会员列表、友圈代发一致：输入 1 个字就开始预搜 -->
    <view wx:if="{{!picked}}" class="row mt">
      <input class="grow" value="{{keyword}}" bindinput="onKeyword" bindconfirm="onSearchTap"
        confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />
      <text wx:if="{{keyword}}" class="muted" style="margin-right:12rpx" bindtap="clearKeyword">清空</text>
      <button class="btn" bindtap="onSearchTap">刷新</button>
    </view>

    <view wx:if="{{picked}}" class="picked mt">
      已选择：<text class="title">{{picked.nickName || picked.phone}}</text>
      <text wx:if="{{picked.phone}}" class="muted">（{{picked.phone}}）</text>
      <text class="muted" style="margin-left:16rpx" bindtap="repick">重新选择</text>
    </view>

    <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>
    <view wx:elif="{{memberEmpty}}" class="muted mt">没有找到匹配「{{keyword}}」的会员</view>

    <view wx:if="{{members.length && !picked}}" class="mt">
      <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pick">
        <view class="grow">
          <view>{{item.nickName || '未命名会员'}}</view>
          <view class="muted">{{item.phone || '未填手机号'}} · {{item.role}}</view>
        </view>
        <text class="muted">选择</text>
      </view>
    </view>
  </view>`

if (!t.includes(from)) {
  console.log('⚠ 未匹配竞赛页搜索区')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 竞赛页搜索区已统一')
