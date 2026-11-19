// 前端：挑战选对手改用 challengeOpponents（会员可用），并清理误导提示
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

// 1. member-search mixin：支持自定义数据源（challengeOpponents）
edit('utils/member-search.js', t => {
  if (t.includes('memberSource')) return t
  return t.replace(
    `  fetchMembers() {
    const limit = this.memberLimit || DEFAULT_LIMIT
    const kw = String(this.data.keyword || '').trim()
    this.setData({ memberLoading: true })
    return api.call('searchMembers', { keyword: kw }, { silent: true })`,
    `  fetchMembers() {
    const limit = this.memberLimit || DEFAULT_LIMIT
    const kw = String(this.data.keyword || '').trim()
    // 员工端用 searchMembers（教练权限，带手机号）；挑战选对手用 challengeOpponents（会员权限，不带手机号）
    const action = this.memberSource || 'searchMembers'
    this.setData({ memberLoading: true })
    return api.call(action, { keyword: kw, limit }, { silent: true })`
  )
}, 'member-search：支持 memberSource')

// 2. 挑战发起页：数据源 + 列表项显示角色而不是手机号
edit('pages/challenges/new/new.js', t => {
  if (t.includes('memberSource')) return t
  return t.replace(
    `  onLoad() {
    this.memberLimit = 20
    this.fetchMembers()`,
    `  onLoad() {
    this.memberLimit = 20
    // 普通会员没有 searchMembers 权限，挑战选对手走专门接口
    this.memberSource = 'challengeOpponents'
    this.fetchMembers()`
  )
}, '发起挑战：改用 challengeOpponents')

edit('pages/challenges/new/new.wxml', t => {
  if (t.includes('ROLE_NAMES')) return t
  return t
    .replace(
      `        <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pickMember">
          <view class="grow">
            <view>{{item.name}}</view>
            <view class="muted">{{item.phone || '未填手机号'}}</view>
          </view>
          <text class="muted">选择</text>
        </view>`,
      `        <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pickMember">
          <view class="grow">
            <view>{{item.name}}</view>
            <view wx:if="{{item.role !== 'member'}}" class="muted">{{item.role === 'coach' ? '教练' : '管理员'}}</view>
          </view>
          <text class="muted">选择</text>
        </view>`
    )
    .replace(
      `    <view class="muted mt" wx:if="{{!members.length && !memberLoading && !keyword && !memberEmpty}}">
      还没有可选会员（会员先打开一次小程序才会出现）
    </view>`,
      `    <view class="muted mt" wx:if="{{!members.length && !memberLoading && !keyword && !memberEmpty}}">
      还没有其他会员
    </view>`
    )
}, '发起挑战：列表显示角色 + 清理提示')

// 3. 已选对手处不再显示手机号
edit('pages/challenges/new/new.wxml', t => {
  return t.replace(
    `      <view class="row" style="gap:12rpx;align-items:center">
        <text class="pick-name">{{opponent.name}}</text>
        <text class="muted">{{opponent.phone || ''}}</text>
      </view>`,
    `      <view class="row" style="gap:12rpx;align-items:center">
        <text class="pick-name">{{opponent.name}}</text>
        <text wx:if="{{opponent.role !== 'member'}}" class="tag">{{opponent.role === 'coach' ? '教练' : '管理员'}}</text>
      </view>`
  )
}, '发起挑战：已选行不显示手机号')

// 4. 员工端会员列表：保留原提示（那里确实需要会员先登录过）
edit('pages/staff/members/members.wxml', t => {
  if (t.includes('会员先打开一次小程序')) return t
  return t.replace(
    `  <view class="hint-block">`,
    `  <view class="hint-block">会员要先打开一次小程序，才会出现在这个列表里。`
  )
}, '员工端：保留说明（那里确实需要）')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/member-search.js', 'pages/challenges/new/new.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
