// data 声明 tab / 两个历史列表；员工端会员详情拆成三个入口
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

// ---------- 1. data 声明 ----------
edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes("tab: 'body',")) return t
  return t.replace(
    `  data: {
    id: '', f: null, loaded: false,`,
    `  data: {
    id: '', f: null, loaded: false,
    // 三类录入拆成 tab：body / strength / activity
    tab: 'body', strengthList: [], activityList: [],`
  )
}, '体测页 data 声明')

// ---------- 2. 会员详情页：一行拆成三行 ----------
edit('pages/staff/member/member.wxml', t => {
  if (t.includes("tab=body")) return t
  const old = `    <view class="list-item" bindtap="goFitness">
      <view class="grow">
        <view>身体数据与力量成绩</view>
        <view class="muted">{{member.latestBody && member.latestBody.score != null ? '身体评分 ' + member.latestBody.score : '尚未录入'}}</view>
      </view>
      <text class="muted">›</text>
    </view>`
  const neu = `    <view class="list-item" bindtap="goBody">
      <view class="grow">
        <view>身体数据</view>
        <view class="muted">{{member.latestBody && member.latestBody.score != null ? '身体评分 ' + member.latestBody.score : '还未录入体测'}}</view>
      </view>
      <text class="muted">›</text>
    </view>
    <view class="list-item" bindtap="goStrength">
      <view class="grow">
        <view>力量成绩</view>
        <view class="muted">{{member.sbdTotal ? '三项合计 ' + member.sbdTotal + ' kg' : '还未录成绩'}}</view>
      </view>
      <text class="muted">›</text>
    </view>
    <view class="list-item" bindtap="goActivity">
      <view class="grow">
        <view>运动记录</view>
        <view class="muted">步行、跑步、骑行、力量训练等</view>
      </view>
      <text class="muted">›</text>
    </view>`
  if (!t.includes(old)) throw new Error('未找到原入口行')
  return t.replace(old, neu)
}, '会员详情页拆成三个入口')

// ---------- 3. 对应三个跳转方法 ----------
edit('pages/staff/member/member.js', t => {
  if (t.includes('goBody()')) return t
  return t.replace(
    `  goFitness() {
    wx.navigateTo({ url: '/pages/staff/fitness/fitness?id=' + this.id })
  },`,
    `  // 三类录入分开进入
  goBody() {
    wx.navigateTo({ url: '/pages/staff/fitness/fitness?id=' + this.id + '&tab=body' })
  },

  goStrength() {
    wx.navigateTo({ url: '/pages/staff/fitness/fitness?id=' + this.id + '&tab=strength' })
  },

  goActivity() {
    wx.navigateTo({ url: '/pages/staff/fitness/fitness?id=' + this.id + '&tab=activity' })
  },`
  )
}, '会员详情页三个跳转方法')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/fitness/fitness.js', 'pages/staff/member/member.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
