// 员工端体测页拆成三个录入 tab：身体数据 / 力量成绩 / 运动记录
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const P = MP + '/pages/staff/fitness/fitness.wxml'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('seg-tab')) {
  console.log('· 已经是分 tab 版本')
  process.exit(0)
}

const lines = t.split('\n')
const pick = (from, to) => lines.slice(from - 1, to).join('\n')

// 原有区块（按行号）
const recognize = pick(2, 25)          // 从体测报告识别卡片
const memberCard = pick(27, 34)        // 会员摘要
const bodyForm = pick(36, 107)         // 录入身体数据
const strengthForm = pick(109, 121)    // 录入力量成绩
const activityForm = pick(123, 148)    // 记录运动
const bodyHistory = pick(150, 161)     // 身体数据历史

const out = `<view class="page" wx:if="{{f}}">
${memberCard}

  <!-- 三类录入拆开：各管各的，不再堆在一页里 -->
  <view class="seg-tabs">
    <view class="seg-tab {{tab === 'body' ? 'on' : ''}}" data-tab="body" bindtap="switchTab">身体数据</view>
    <view class="seg-tab {{tab === 'strength' ? 'on' : ''}}" data-tab="strength" bindtap="switchTab">力量成绩</view>
    <view class="seg-tab {{tab === 'activity' ? 'on' : ''}}" data-tab="activity" bindtap="switchTab">运动记录</view>
  </view>

  <!-- ============ 身体数据 ============ -->
  <block wx:if="{{tab === 'body'}}">
${recognize}

${bodyForm}

${bodyHistory}
  </block>

  <!-- ============ 力量成绩 ============ -->
  <block wx:if="{{tab === 'strength'}}">
${strengthForm}

    <view class="section-title between">
      <text>力量成绩历史</text>
      <text class="muted">最近 {{strengthList.length}} 条</text>
    </view>
    <view class="card">
      <view wx:if="{{!strengthList.length}}" class="muted">暂无记录</view>
      <view wx:for="{{strengthList}}" wx:key="id" class="list-item">
        <view class="grow">
          <view>{{item.liftName}} <text class="muted">{{item.date}}</text></view>
          <view class="muted">{{item.weight}} kg × {{item.reps}} 次 → 约 {{item.oneRM}} kg</view>
        </view>
        <text wx:if="{{item.isBest}}" class="tag orange">最好</text>
      </view>
    </view>
  </block>

  <!-- ============ 运动记录 ============ -->
  <block wx:if="{{tab === 'activity'}}">
${activityForm}

    <view class="section-title between">
      <text>最近运动</text>
      <text class="muted" wx:if="{{activityList.length}}">最近 {{activityList.length}} 次</text>
    </view>
    <view class="card">
      <view wx:if="{{!activityList.length}}" class="muted">暂无记录</view>
      <view wx:for="{{activityList}}" wx:key="id" class="list-item">
        <view class="grow">
          <view>{{item.typeName}} <text class="muted">{{item.date}}</text></view>
          <view class="muted">{{item.detail || '已记录'}}</view>
        </view>
        <text wx:if="{{item.avgHr}}" class="tag">{{item.avgHr}} 次/分</text>
      </view>
    </view>
  </block>
</view>
`

fs.writeFileSync(P, CRLF ? out.replace(/\n/g, '\r\n') : out)
console.log('  ✓ wxml 拆成三个 tab（' + out.split('\n').length + ' 行）')
