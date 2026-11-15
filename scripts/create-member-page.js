// 新增公开的会员资料页 pages/member/member
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const DIR = path.join(MP, 'pages/member')
fs.mkdirSync(DIR, { recursive: true })
const log = []

// ---------- js ----------
const js = `const api = require('../../utils/api')

// 设备报告里的指标，有值才显示
const METRICS = [
  { key: 'weight', name: '体重', unit: 'kg' },
  { key: 'bodyFat', name: '体脂率', unit: '%' },
  { key: 'muscle', name: '肌肉量', unit: 'kg' },
  { key: 'muscleRate', name: '肌肉率', unit: '%' },
  { key: 'protein', name: '蛋白质量', unit: 'kg' },
  { key: 'water', name: '体水分量', unit: 'kg' },
  { key: 'boneMass', name: '骨盐量', unit: 'kg' },
  { key: 'fatMass', name: '脂肪量', unit: 'kg' },
  { key: 'skeletalMuscle', name: '骨骼肌量', unit: 'kg' },
  { key: 'visceral', name: '内脏脂肪', unit: '级' },
  { key: 'heartRate', name: '心率', unit: '次/分' },
  { key: 'bmi', name: 'BMI', unit: '' },
  { key: 'waistHipRatio', name: '腰臀比', unit: '' },
  { key: 'bodyAge', name: '身体年龄', unit: '岁' },
  { key: 'bmr', name: '基础代谢', unit: 'kcal' },
  { key: 'fatFreeMass', name: '去脂体重', unit: 'kg' }
]

Page({
  data: {
    loaded: false,
    openid: '',
    member: null,
    f: null,
    hasBody: false,
    score: 0,
    scoreDetail: [],
    metrics: [],
    bestList: [],
    bodyList: [],
    showAllHistory: false
  },

  onLoad(query) {
    this.setData({ openid: (query && query.openid) || '' })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    const openid = this.data.openid
    if (!openid) {
      return Promise.resolve().then(() => this.setData({ loaded: true }))
    }
    wx.showLoading({ title: '加载中', mask: true })
    return Promise.all([
      api.call('memberProfile', { openid }, { silent: true }),
      api.call('memberFitness', { openid }, { silent: true }).catch(() => null)
    ]).then(([member, f]) => {
      wx.hideLoading()
      wx.setNavigationBarTitle({ title: (member && member.nickName) || '会员资料' })
      const latest = (f && f.latestBody) || null
      const history = (f && f.bodyHistory) || []
      this.setData({
        loaded: true,
        member,
        f,
        hasBody: !!latest,
        score: latest && latest.score != null ? latest.score : 0,
        scoreDetail: (latest && latest.detail) || [],
        metrics: latest ? METRICS.filter(m => latest[m.key] != null && latest[m.key] !== '').map(m => ({
          key: m.key, name: m.name, unit: m.unit, value: latest[m.key]
        })) : [],
        bestList: ((f && f.lifts) || []).map(l => {
          const b = f.bestLift[l.key]
          return { key: l.key, name: l.name, oneRM: b ? b.oneRM : 0, has: !!b }
        }),
        bodyList: history.map(b => ({
          id: b._id,
          date: b.date,
          weight: b.weight == null ? '-' : b.weight,
          bodyFat: b.bodyFat == null ? '-' : b.bodyFat,
          muscle: b.muscle == null ? '-' : b.muscle,
          bmi: b.bmi == null ? '-' : b.bmi,
          score: b.score == null ? '-' : b.score
        }))
      })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  toggleHistory() {
    this.setData({ showAllHistory: !this.data.showAllHistory })
  }
})
`
fs.writeFileSync(path.join(DIR, 'member.js'), js)
log.push('member.js')

// ---------- json ----------
fs.writeFileSync(path.join(DIR, 'member.json'), JSON.stringify({
  navigationBarTitleText: '会员资料',
  enablePullDownRefresh: true
}, null, 2) + '\n')
log.push('member.json')

// ---------- wxml ----------
const wxml = `<view class="page">
  <view wx:if="{{loaded && !member}}" class="card">
    <view class="title">找不到这位会员</view>
    <view class="muted mt">可能账号已注销，或链接不完整。</view>
  </view>

  <block wx:else>
    <!-- 基本资料 -->
    <view class="card member-head">
      <image wx:if="{{member.avatar}}" class="avatar" src="{{member.avatar}}" mode="aspectFill" />
      <view wx:else class="avatar avatar-empty">＋</view>
      <view class="grow ml">
        <view class="row">
          <text class="title">{{member.nickName || '未设置昵称'}}</text>
          <text class="tag orange ml-sm">{{member.roleName}}</text>
          <text wx:if="{{member.isMe}}" class="tag ml-sm">我</text>
        </view>
        <view class="muted mt-sm">
          <text wx:if="{{member.gender === 'male'}}">男</text>
          <text wx:elif="{{member.gender === 'female'}}">女</text>
          <text wx:if="{{member.height}}"> · {{member.height}} cm</text>
          <text wx:if="{{member.since}}"> · {{member.since}} 加入</text>
        </view>
        <view wx:if="{{member.phone}}" class="muted">{{member.phone}}</view>
      </view>
    </view>

    <!-- 身体评分 -->
    <view wx:if="{{hasBody}}" class="card">
      <view class="between">
        <text class="title">身体评分</text>
        <view class="row">
          <text wx:if="{{f.latestBody.deviceScore}}" class="tag">设备 {{f.latestBody.deviceScore}} 分</text>
          <text class="tag orange">{{score}} 分</text>
        </view>
      </view>
      <view class="muted mt">{{f.latestBody.date}} 测量{{f.latestBody.deviceName ? ' · ' + f.latestBody.deviceName : ''}}</view>
      <view wx:for="{{scoreDetail}}" wx:key="key" class="form-row">
        <text class="label">{{item.label}}</text>
        <text class="grow">{{item.score}} / {{item.max}}</text>
      </view>
    </view>

    <!-- 身体指标 -->
    <block wx:if="{{metrics.length}}">
      <view class="section-title">身体指标</view>
      <view class="card">
        <view class="grid">
          <view wx:for="{{metrics}}" wx:key="key" class="grid-cell">
            <view class="grid-v">{{item.value}}<text wx:if="{{item.unit}}" class="grid-u">{{item.unit}}</text></view>
            <view class="muted">{{item.name}}</view>
          </view>
        </view>
      </view>
    </block>

    <!-- 历史身体资料 -->
    <block wx:if="{{bodyList.length}}">
      <view class="section-title between">
        <text>历史身体资料</text>
        <text class="muted">{{bodyList.length}} 条</text>
      </view>
      <view class="card">
        <view wx:for="{{bodyList}}" wx:key="id" wx:if="{{showAllHistory || index < 5}}" class="list-item">
          <view class="grow">
            <view class="title-sm">{{item.date}}</view>
            <view class="muted">体重 {{item.weight}}kg · 体脂 {{item.bodyFat}}% · 肌肉 {{item.muscle}}kg</view>
          </view>
          <text class="tag orange">{{item.score}} 分</text>
        </view>
        <view wx:if="{{bodyList.length > 5}}" class="list-hint" bindtap="toggleHistory">
          {{showAllHistory ? '收起' : '展开全部 ' + bodyList.length + ' 条'}}
        </view>
      </view>
    </block>

    <!-- 力量成绩 -->
    <block wx:if="{{bestList.length}}">
      <view class="section-title">力量成绩</view>
      <view class="card">
        <view wx:for="{{bestList}}" wx:key="key" class="list-item">
          <text class="grow">{{item.name}}</text>
          <text wx:if="{{item.has}}" class="price">{{item.oneRM}} kg</text>
          <text wx:else class="muted">还没有成绩</text>
        </view>
        <view wx:if="{{f.sbdTotal}}" class="list-item">
          <text class="grow">三项合计</text>
          <text class="price">{{f.sbdTotal}} kg</text>
        </view>
      </view>
    </block>

    <!-- 没有数据 -->
    <view wx:if="{{loaded && !hasBody && !bodyList.length}}" class="card">
      <view class="title">还没有身体数据</view>
      <view class="muted mt">教练用体测设备测量后录入，这里就会显示最新数据和历史记录。</view>
    </view>
  </block>
</view>
`
fs.writeFileSync(path.join(DIR, 'member.wxml'), wxml)
log.push('member.wxml')

// ---------- wxss ----------
const wxss = `.member-head {
  display: flex;
  align-items: center;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  flex: none;
  background: var(--fill);
}

.avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 44rpx;
}

.title-sm {
  font-size: 28rpx;
  color: var(--ink);
}

.grid {
  display: flex;
  flex-wrap: wrap;
}

.grid-cell {
  width: 33.33%;
  padding: 16rpx 0;
  text-align: center;
}

.grid-v {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--ink);
}

.grid-u {
  font-size: 22rpx;
  font-weight: 400;
  color: var(--muted);
  margin-left: 4rpx;
}
`
fs.writeFileSync(path.join(DIR, 'member.wxss'), wxss)
log.push('member.wxss')

console.log('已创建：' + log.join(', '))
