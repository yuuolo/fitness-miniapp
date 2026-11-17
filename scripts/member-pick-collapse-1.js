// 会员选择：默认收起，点「选择会员」图标才展开列表（竞赛录入 + 友圈代发）
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

// ================= 1. 竞赛录入 =================
edit('pages/staff/competition-entry/competition-entry.js', t => {
  t = t.replace(
    `    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,`,
    `    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,
    memberOpen: false,`
  )
  t = t.replace(
    `  // 与会员列表、友圈代发共用同一套搜索：输入即搜（1 个字起）
  onKeyword(e) {
    this.memberInput(e)
  },`,
    `  // 默认收起会员列表，点「选择会员」图标才展开
  toggleMemberPick() {
    const open = !this.data.memberOpen
    this.setData({ memberOpen: open })
    if (open && !(this.data.members || []).length) this.fetchMembers()
  },

  // 与会员列表、友圈代发共用同一套搜索：输入即搜（1 个字起）
  onKeyword(e) {
    this.memberInput(e)
  },`
  )
  // 重新选择：清空已选并展开列表
  t = t.replace(
    `  // 重新选一个人
  repick() {
    this.setData({ picked: null })
  },`,
    `  // 重新选一个人：清空已选并展开列表
  repick() {
    this.setData({ picked: null, memberOpen: true })
    this.memberSearchNow()
  },`
  )
  // 选中后收起列表
  t = t.replace(
    `  pick(e) {
    const openid = e.currentTarget.dataset.openid
    const m = this.data.members.find(x => x._id === openid)
    this.setData({ picked: m || null })`,
    `  pick(e) {
    const openid = e.currentTarget.dataset.openid
    const m = this.data.members.find(x => x._id === openid)
    this.setData({ picked: m || null, memberOpen: false })`
  )
  return t
}, '竞赛录入：会员选择可收起')

edit('pages/staff/competition-entry/competition-entry.wxml', t => {
  const from = `  <view class="card">
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

  const to = `  <view class="card">
    <!-- 默认只显示一行；点「选择会员」图标才展开搜索和列表 -->
    <view class="between">
      <text class="muted">选择会员</text>
      <view wx:if="{{picked}}" class="row" style="gap:12rpx;align-items:center">
        <text class="title">{{picked.nickName || picked.phone}}</text>
        <text wx:if="{{picked.phone}}" class="muted">（{{picked.phone}}）</text>
        <view class="pick-btn" bindtap="repick">更换</view>
      </view>
      <view wx:else class="pick-btn {{memberOpen ? 'on' : ''}}" bindtap="toggleMemberPick">👤 选择会员</view>
    </view>

    <block wx:if="{{memberOpen}}">
      <view class="row mt">
        <input class="grow" value="{{keyword}}" bindinput="onKeyword" bindconfirm="onSearchTap"
          confirm-type="search" placeholder="输入昵称或手机号，1 个字就能搜" />
        <text wx:if="{{keyword}}" class="muted" style="margin-right:12rpx" bindtap="clearKeyword">清空</text>
        <button class="btn" bindtap="onSearchTap">刷新</button>
      </view>

      <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>
      <view wx:elif="{{memberEmpty}}" class="muted mt">没有找到匹配「{{keyword}}」的会员</view>

      <view wx:if="{{members.length}}" class="mt">
        <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pick">
          <view class="grow">
            <view>{{item.nickName || '未命名会员'}}</view>
            <view class="muted">{{item.phone || '未填手机号'}} · {{item.role}}</view>
          </view>
          <text class="muted">选择</text>
        </view>
      </view>
    </block>
  </view>`

  if (!t.includes(from)) throw new Error('竞赛页会员选择区未匹配')
  return t.replace(from, to)
}, '竞赛录入：wxml 收起')

// ================= 2. 友圈代发 =================
edit('pages/moments/post/post.js', t => {
  t = t.replace(
    `    memberLoading: false,
    memberEmpty: false,
    pickedMember: null,`,
    `    memberLoading: false,
    memberEmpty: false,
    pickedMember: null,
    memberOpen: false,`
  )
  t = t.replace(
    `  onKeywordInput(e) {
    this.memberInput(e)
  },`,
    `  // 默认收起会员列表，点「选择会员」图标才展开
  toggleMemberPick() {
    const open = !this.data.memberOpen
    this.setData({ memberOpen: open })
    if (open && !(this.data.members || []).length) this.fetchMembers()
  },

  onKeywordInput(e) {
    this.memberInput(e)
  },`
  )
  t = t.replace(
    `  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ pickedMember: m })
  },

  clearPickedMember() {
    this.setData({ pickedMember: null })
  },`,
    `  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ pickedMember: m, memberOpen: false })
  },

  clearPickedMember() {
    this.setData({ pickedMember: null, memberOpen: false })
  },`
  )
  return t
}, '友圈代发：会员选择可收起')

edit('pages/moments/post/post.wxml', t => {
  const from = `    <view wx:if="{{!pickedMember}}" class="row mt">
      <input class="grow" value="{{keyword}}" bindinput="onKeywordInput" bindconfirm="onKeywordConfirm"
        confirm-type="search" placeholder="搜会员昵称或手机号，1 个字就能搜" />
      <text wx:if="{{keyword}}" class="muted" style="margin-right:12rpx" bindtap="clearKeyword">清空</text>
    </view>
    <view wx:if="{{memberLoading}}" class="muted mt">搜索中…</view>
    <view wx:elif="{{memberEmpty}}" class="muted mt">没有找到匹配「{{keyword}}」的会员</view>
    <view wx:if="{{members.length && !pickedMember}}" class="mt">
      <view wx:for="{{members}}" wx:key="_id" class="list-item" data-openid="{{item._id}}" bindtap="pickMember">
        <view class="grow">
          <view>{{item.name}}</view>
          <view class="muted">{{item.phone || '未填手机号'}}</view>
        </view>
        <text class="muted">选择</text>
      </view>
    </view>`

  const to = `    <view wx:if="{{!pickedMember}}" class="between mt">
      <view class="pick-btn {{memberOpen ? 'on' : ''}}" bindtap="toggleMemberPick">👤 选择会员</view>
    </view>
    <block wx:if="{{memberOpen}}">
      <view class="row mt">
        <input class="grow" value="{{keyword}}" bindinput="onKeywordInput" bindconfirm="onKeywordConfirm"
          confirm-type="search" placeholder="搜会员昵称或手机号，1 个字就能搜" />
        <text wx:if="{{keyword}}" class="muted" style="margin-right:12rpx" bindtap="clearKeyword">清空</text>
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
    </block>`

  if (!t.includes(from)) throw new Error('友圈代发会员区未匹配')
  return t.replace(from, to)
}, '友圈代发：wxml 收起')

// ================= 3. 样式（两页共用，各自 wxss 里加） =================
const style = `
/* 「选择会员」图标按钮：默认收起列表，点它才展开 */
.pick-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: 26rpx;
  color: var(--brand-strong);
  background: var(--fill);
  border-radius: var(--r-pill);
  padding: 10rpx 22rpx;
}
.pick-btn.on { background: var(--brand); color: #fff; }
`
for (const rel of ['pages/staff/competition-entry/competition-entry.wxss', 'pages/moments/post/post.wxss']) {
  edit(rel, t => {
    if (t.includes('.pick-btn')) return t
    return t + style
  }, '样式：' + rel.split('/')[1])
}

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/competition-entry/competition-entry.js', 'pages/moments/post/post.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
