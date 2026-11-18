// 挑战功能前端 4/4：教练端「待我判决」列表 + 注册页面 + 入口
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

// ---------- 1. 教练端挑战列表 ----------
const staffJs = `// 教练端：我当裁判的挑战（待接单 / 待判决）
const api = require('../../../utils/api')

function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return '已超时'
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? h + ' 小时 ' + (m % 60) + ' 分' : Math.max(1, m) + ' 分钟'
}

Page({
  data: { list: [], loaded: false, counts: {} },

  onShow() { this.load() },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('challengeList', { tab: 'judging' }, { silent: true }).then(r => {
      const list = (r.list || []).map(it => Object.assign({}, it, {
        countdownText: countdown(it.deadline),
        // 待接单 / 待判决 分两类
        kind: it.canRefereeAct ? 'invite' : (it.canJudge ? 'judge' : 'other')
      }))
      this.setData({ list, counts: r.counts || {}, loaded: true })
    }, () => this.setData({ loaded: true }))
  },

  open(e) {
    wx.navigateTo({ url: '/pages/challenges/detail?id=' + e.currentTarget.dataset.id })
  }
})
`

const staffWxml = `<view class="page">
  <view class="card">
    <view class="muted">你是这些挑战的主裁判</view>
    <view class="todo-row">
      <text class="tag orange">待接单 {{counts.judgingInvite || 0}}</text>
      <text class="tag orange">待判决 {{counts.toJudge || 0}}</text>
    </view>
  </view>

  <view wx:if="{{loaded && !list.length}}" class="card muted">
    暂时没有指派给你的挑战。会员发起挑战时可以选你当裁判。
  </view>

  <view wx:for="{{list}}" wx:key="_id" class="card" data-id="{{item._id}}" bindtap="open">
    <view class="between">
      <view class="row" style="gap:10rpx;align-items:center">
        <text class="tag orange">{{item.liftName}}</text>
        <text class="tag {{item.kind === 'judge' ? 'orange' : ''}}">
          {{item.kind === 'invite' ? '待接单' : (item.kind === 'judge' ? '待判决' : item.statusName)}}
        </text>
      </view>
      <text class="muted">{{item.countdownText}}</text>
    </view>
    <view class="vs">{{item.challenger.name}} <text class="muted">VS</text> {{item.opponent.name}}</view>
    <view wx:if="{{item.trashTalk}}" class="muted">「{{item.trashTalk}}」</view>
  </view>
</view>
`

const staffWxss = `/* 教练端挑战 */
.todo-row { display: flex; gap: 12rpx; margin-top: 10rpx; }
.vs { font-size: 30rpx; font-weight: 600; color: var(--ink); margin: 12rpx 0 6rpx; }
`

const staffJson = JSON.stringify({
  navigationBarTitleText: '我当裁判的挑战',
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
}, null, 2) + '\n'

const staffDir = MP + '/pages/staff/challenges'
fs.writeFileSync(staffDir + '/challenges.js', staffJs)
fs.writeFileSync(staffDir + '/challenges.wxml', staffWxml)
fs.writeFileSync(staffDir + '/challenges.wxss', staffWxss)
fs.writeFileSync(staffDir + '/challenges.json', staffJson)
done.push('pages/staff/challenges')

// ---------- 2. app.json 注册 ----------
const appPath = MP + '/app.json'
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))
const add = [
  'pages/challenges/list',
  'pages/challenges/new',
  'pages/challenges/detail',
  'pages/staff/challenges/challenges'
]
let added = 0
for (const p of add) {
  if (!app.pages.includes(p)) {
    // 插到 manual 之前，保持顺序稳定
    const i = app.pages.indexOf('pages/manual/manual')
    if (i < 0) app.pages.push(p)
    else app.pages.splice(i, 0, p)
    added++
  }
}
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
done.push('app.json 注册 ' + added + ' 个页面')

// ---------- 3. 我的页面加入口 ----------
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
  if (t.includes('goChallenges')) return t
  const anchor = `      <view wx:if="{{features.rank !== false}}" class="menu-item" bindtap="goRank">`
  const block = `      <view wx:if="{{features.rank !== false}}" class="menu-item" bindtap="goChallenges">
        <view class="mi mi-flame"></view><text class="grow">会员挑战</text>
        <text wx:if="{{challengeBadge}}" class="tag orange">{{challengeBadge}}</text>
        <text class="chevron">›</text>
      </view>
${anchor}`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到排行榜入口')
    return t
  }
  return t.replace(anchor, block)
}, '我的页面加会员挑战入口')

edit('pages/mine/mine.js', t => {
  if (t.includes('goChallenges')) return t
  t = t.replace(
    `  goActivity() {`,
    `  goChallenges() {
    wx.navigateTo({ url: '/pages/challenges/list' })
  },

  goActivity() {`
  )
  return t
}, '我的页面跳转方法')

// ---------- 4. 教练工作台加入口 ----------
edit('pages/staff/index/index.wxml', t => {
  if (t.includes('challenges/challenges')) return t
  const anchor = `<view class="list-item" data-url="/pages/staff/competitions/competitions" bindtap="go">`
  const block = `<view wx:if="{{isCoach}}" class="list-item" data-url="/pages/staff/challenges/challenges" bindtap="go">
      <text class="grow">我当裁判的挑战</text><text class="muted">›</text>
    </view>
    ${anchor}`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到竞赛管理入口')
    return t
  }
  return t.replace(anchor, block)
}, '工作台加裁判入口')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/challenges/challenges.js', 'pages/mine/mine.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
