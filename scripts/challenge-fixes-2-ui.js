// 2) 会员搜索修复：bindconfirm 改成触发搜索（原来绑定清空，按键盘搜索键会把关键字清掉）
// 3) 挑战动作自动订阅全部相关提醒
// 4) 订阅页布局优化
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

// ---------- 2. 搜索确认键 ----------
edit('pages/challenges/new/new.wxml', t => t
  .replace(
    `        <input class="grow" value="{{keyword}}" bindinput="onKeyword" bindconfirm="clearKeyword"
          confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />`,
    `        <input class="grow" value="{{keyword}}" bindinput="onKeyword" bindconfirm="onKeywordConfirm"
          confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />`
  )
  .replace(
    `    <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>`,
    `    <view class="muted mt" wx:if="{{!members.length && !memberLoading && !keyword && !memberEmpty}}">
      还没有可选会员（会员先打开一次小程序才会出现）
    </view>
    <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>`
  ), '发起挑战：搜索确认键 + 空态提示')

edit('pages/challenges/new/new.js', t => {
  if (t.includes('onKeywordConfirm')) return t
  return t.replace(
    `  onKeyword(e) { this.memberInput(e) },`,
    `  onKeyword(e) { this.memberInput(e) },
  onKeywordConfirm() { this.memberConfirm() },`
  )
}, '发起挑战：onKeywordConfirm')

// 友圈代发页的会员搜索也有同样的 bindconfirm 问题
edit('pages/moments/post/post.wxml', t => {
  if (t.includes('onKeywordConfirm')) return t
  return t.replace(
    `bindconfirm="clearKeyword"`,
    `bindconfirm="onKeywordConfirm"`
  )
}, '友圈代发：搜索确认键')

edit('pages/moments/post/post.js', t => {
  if (t.includes('onKeywordConfirm')) return t
  return t.replace(
    `  onKeywordInput(e) {
    this.memberInput(e)
  },`,
    `  onKeywordInput(e) {
    this.memberInput(e)
  },

  onKeywordConfirm() {
    this.memberConfirm()
  },`
  )
}, '友圈代发：onKeywordConfirm')

// ---------- 3. 挑战各动作时自动订阅全部挑战提醒 ----------
edit('pages/challenges/new/new.js', t => {
  return t.replace(
    "subscribe.requestSync(['invite', 'result'])",
    "subscribe.requestSync(['invite', 'start', 'result'])"
  )
}, '发起挑战：订阅 3 个模板')

edit('pages/challenges/detail/detail.js', t => {
  let out = t
  out = out.replace(/subscribe\.requestSync\(\['result'\]\)/g, "subscribe.requestSync(['invite', 'start', 'result'])")
  out = out.replace(/subscribe\.requestSync\(\['start'\]\)/g, "subscribe.requestSync(['invite', 'start', 'result'])")
  return out
}, '应战/交视频/裁判接单：订阅 3 个模板')

// ---------- 4. 订阅页布局优化 ----------
edit('pages/subscribe/subscribe.wxml', t => {
  if (t.includes('sub-group')) return t
  return `<view class="page">
  <!-- 顶部说明 -->
  <view class="card hero-sub">
    <view class="hero-title">微信提醒</view>
    <view class="muted">有新内容时推到你的微信。微信规定一次授权只能收一条，想持续收就多点几次。</view>
    <view class="hero-count">
      <text class="num">{{total}}</text>
      <text class="muted"> 条待发提醒</text>
    </view>
  </view>

  <!-- 内容提醒 -->
  <view class="card sub-group">
    <view class="group-head">
      <view class="group-title">内容提醒</view>
      <view class="muted">友圈新视频 · 竞赛动态 · 两个排行榜</view>
    </view>
    <view wx:for="{{topics}}" wx:key="key" class="sub-item">
      <view class="grow">
        <view class="sub-name">{{item.name}}</view>
        <view class="muted">{{item.desc}}</view>
      </view>
      <view class="sub-right">
        <text class="ticket {{item.tickets ? 'on' : ''}}">{{item.tickets}} 条</text>
        <text wx:if="{{item.tickets}}" class="clear" data-topic="{{item.key}}" bindtap="clearTopic">清零</text>
      </view>
    </view>
    <button class="btn block sub-action" bindtap="subscribeAll" disabled="{{subscribing || !ready}}">
      {{subscribing ? '授权中…' : (ready ? '订阅内容提醒（4 项一次搞定）' : '正在准备…')}}
    </button>
  </view>

  <!-- 挑战提醒（单独一张卡） -->
  <view class="card sub-group challenge-group">
    <view class="group-head">
      <view class="group-title">挑战提醒</view>
      <view class="muted">有人挑战我 · 该我判了 · 判定结果</view>
    </view>
    <view class="muted">发起挑战、应战、裁判接单时会自动申请，这里手动补一次也行。</view>
    <button class="btn ghost block sub-action" bindtap="subscribeChallenge" disabled="{{challengeSubscribing || !ready}}">
      {{challengeSubscribing ? '授权中…' : '订阅挑战提醒'}}
    </button>
  </view>

  <!-- 说明 -->
  <view class="card tip-card">
    <view class="muted">说明</view>
    <view class="muted mt">· 一次授权发一条，发一条消耗一张票，票用完要回来再点</view>
    <view class="muted">· 自己发的内容不会提醒自己</view>
    <view class="muted">· 不想收某个话题可以点「清零」</view>
  </view>
</view>
`
}, '订阅页：布局重做')

edit('pages/subscribe/subscribe.wxss', t => {
  if (t.includes('.sub-group')) return t
  return `/* 订阅管理 */
.hero-sub { background: linear-gradient(180deg, var(--brand-soft), var(--surface)); }
.hero-title { font-size: 34rpx; font-weight: 600; color: var(--ink); margin-bottom: 8rpx; }
.hero-count { display: flex; align-items: baseline; gap: 8rpx; margin-top: 18rpx; }
.hero-count .num { font-size: 52rpx; font-weight: 700; color: var(--brand-strong); }

/* 两组之间留足空隙 */
.sub-group { margin-top: 24rpx; }
.challenge-group { margin-top: 28rpx; background: var(--surface); border: 1rpx solid var(--line); }
.group-head { margin-bottom: 8rpx; }
.group-title { font-size: 30rpx; font-weight: 600; color: var(--ink); margin-bottom: 4rpx; }

.sub-item { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid var(--line); }
.sub-item:last-of-type { border-bottom: none; }
.sub-name { font-size: 28rpx; font-weight: 600; color: var(--ink); }
.sub-right { display: flex; align-items: center; gap: 14rpx; }
.ticket { font-size: 24rpx; color: var(--muted); background: var(--fill); border-radius: var(--r-pill); padding: 6rpx 16rpx; }
.ticket.on { color: var(--brand-strong); background: var(--brand-soft); }
.clear { font-size: 23rpx; color: var(--muted); }

.sub-action { margin-top: 24rpx; }
.tip-card { margin-top: 28rpx; }
`
}, '订阅页：样式重做')

// 订阅页 JS：错误提示保留
edit('pages/subscribe/subscribe.js', t => {
  if (t.includes('tipOf')) return t
  return t.replace(
    `  // 一键订阅：一次点击把内容更新的 3 个模板都授权（rankScore / rankLift 共用同一个模板）`,
    `  // 把错误码翻译成能看懂的话
  tipOf(reason) {
    if (reason === 'not-ready') return '模板还在准备，稍等 2 秒再点一次'
    if (reason === 'rejected') return '你点了“取消”，同意后才能收到通知'
    if (reason === 'no-template') return '后台还没配好通知模板'
    if (/TAP|gesture/i.test(reason)) return '请再点一次按钮（微信要求必须由点击触发）'
    if (/timeout/i.test(reason)) return '微信没响应，请再点一次'
    return '订阅失败：' + reason
  },

  // 一键订阅：一次点击把内容更新的 3 个模板都授权（rankScore / rankLift 共用同一个模板）`
  )
}, '订阅页：错误提示')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/challenges/new/new.js', 'pages/challenges/detail/detail.js', 'pages/subscribe/subscribe.js', 'pages/moments/post/post.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
