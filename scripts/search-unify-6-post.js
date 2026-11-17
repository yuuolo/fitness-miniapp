// 友圈代发会员选择：下拉框改成可搜索列表（与其它搜索一致）
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

// ---------- js ----------
edit('pages/moments/post/post.js', t => {
  // require
  t = t.replace(
    `const sfx = require('../../../utils/sfx')`,
    `const sfx = require('../../../utils/sfx')
const memberSearch = require('../../../utils/member-search')`
  )
  // data
  t = t.replace(
    `    members: [],
    memberIndex: -1,`,
    `    // 代发时选会员：与其它页面一致的搜索行为
    members: [],
    keyword: '',
    memberLoading: false,
    memberEmpty: false,
    pickedMember: null,`
  )
  // loadMembers → 用 mixin
  t = t.replace(
    `  loadMembers() {
    api.call('searchMembers', { keyword: '' }, { silent: true }).then(list => {
      this.setData({
        members: list.map(m => ({ _id: m._id, name: m.nickName || m.phone || '未命名会员' }))
      })
    }, () => {})
  },`,
    `  loadMembers() {
    this.memberLimit = 20
    return this.fetchMembers()
  },

  onKeywordInput(e) {
    this.memberInput(e)
  },

  onKeywordConfirm() {
    this.memberConfirm()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ pickedMember: m })
  },

  clearPickedMember() {
    this.setData({ pickedMember: null })
  },

  onUnload() {
    this.stopMemberSearch()
  },`
  )
  // onMember（旧 picker）删掉
  t = t.replace(
    `  onMember(e) {
    this.setData({ memberIndex: Number(e.detail.value) })
  },

`,
    ''
  )
  // submit 里改用 pickedMember
  t = t.replace(
    `      if (this.data.canCoach && this.data.memberIndex >= 0) {
        const t = this.data.members[this.data.memberIndex]
        if (t) payload.openid = t._id
      }`,
    `      if (this.data.canCoach && this.data.pickedMember) {
        payload.openid = this.data.pickedMember._id
      }`
  )
  // 用 mixin 包装 Page
  t = t.replace(/^Page\(\{/m, 'Page(Object.assign({}, memberSearch.mixin, {')
  t = t.replace(/\n\}\)\n?$/, '\n}))\n')
  return t
}, 'post.js 代发选会员')

// ---------- wxml ----------
edit('pages/moments/post/post.wxml', t => {
  const from = `  <view wx:if="{{canCoach}}" class="card">
    <view class="form-row">
      <text class="label">为谁发布</text>
      <picker range="{{members}}" range-key="name" value="{{memberIndex}}" bindchange="onMember">
        <view class="{{memberIndex >= 0 ? 'picker-text' : 'placeholder'}}">
          {{memberIndex >= 0 ? members[memberIndex].name : '默认发给我自己'}}
        </view>
      </picker>
    </view>
    <view class="muted mt">教练可以帮会员拍并代发，动态会记在你名下。</view>
  </view>`
  const to = `  <view wx:if="{{canCoach}}" class="card">
    <view class="form-row">
      <text class="label">为谁发布</text>
      <view class="grow" style="text-align:right">
        <text wx:if="{{pickedMember}}" class="tag orange">{{pickedMember.name}}</text>
        <text wx:else class="muted">默认发给我自己</text>
        <text wx:if="{{pickedMember}}" class="muted" style="margin-left:12rpx" bindtap="clearPickedMember">清除</text>
      </view>
    </view>

    <view wx:if="{{!pickedMember}}" class="row mt">
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
    </view>

    <view class="muted mt">教练可以帮会员拍并代发，动态会记在会员名下。</view>
  </view>`
  if (!t.includes(from)) {
    console.log('  [!] 未匹配代发选择区')
    return t
  }
  return t.replace(from, to)
}, 'post.wxml 代发选会员')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/moments/post/post.js'])
console.log('  ✓ 语法通过')
