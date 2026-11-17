// 友圈：reload/loadMore 带上 keyword/onlyVideo；wxml 加搜索栏
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

// ---------- 1. reload / loadMore 带搜索条件 ----------
edit('pages/moments/moments.js', t => {
  t = t.replace(
    `  reload() {
    return api.call('momentList', {}).then(r => resolveVideoUrls(r.list)).then(list => {
      this.setData({ loaded: true, list, hasMore: this.data.hasMore && list.length > 0 })
    }, () => this.setData({ loaded: true }))
  },`,
    `  // 当前搜索条件（1 个字起就传，服务端按内容/作者名模糊搜）
  searchParams() {
    const p = {}
    const kw = String(this.data.keyword || '').trim()
    if (kw) p.keyword = kw
    if (this.data.onlyVideo) p.onlyVideo = true
    return p
  },

  reload() {
    const params = this.searchParams()
    this.setData({ loading: false })
    return api.call('momentList', params).then(r => resolveVideoUrls(r.list)).then(list => {
      this.setData({ loaded: true, list, hasMore: list.length >= 20 })
    }, () => this.setData({ loaded: true }))
  },`
  )
  t = t.replace(
    `    return api.call('momentList', { before }, { silent: true })`,
    `    return api.call('momentList', Object.assign({ before }, this.searchParams()), { silent: true })`
  )
  return t
}, '友圈列表带搜索条件')

// ---------- 2. 友圈 wxml：搜索栏 ----------
edit('pages/moments/moments.wxml', t => {
  if (t.includes('search-bar')) return t
  // 插在页面最顶部（列表前）
  const anchor = '  <view class="page">'
  const bar = `  <view class="page">
    <!-- 搜索：输入 1 个字就开始预搜；可只看视频 -->
    <view class="search-bar">
      <view class="search-box">
        <text class="search-ico">🔍</text>
        <input class="search-input" value="{{keyword}}" placeholder="搜内容 / 作者，1 个字就能搜"
          confirm-type="search" bindinput="onSearchInput" bindconfirm="onSearchConfirm" />
        <text wx:if="{{keyword}}" class="search-clear" catchtap="clearSearch">✕</text>
      </view>
      <view class="search-chip {{onlyVideo ? 'on' : ''}}" bindtap="toggleVideoOnly">只看视频</view>
    </view>`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到页面根节点')
    return t
  }
  return t.replace(anchor, bar)
}, '友圈搜索栏')

// ---------- 3. 样式 ----------
edit('pages/moments/moments.wxss', t => {
  if (t.includes('.search-bar')) return t
  return t + `
/* 搜索栏：输入即预搜 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 8rpx 0 16rpx;
}
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10rpx;
  background: var(--fill);
  border-radius: var(--r-pill);
  padding: 0 20rpx;
  height: 68rpx;
}
.search-ico { font-size: 24rpx; opacity: 0.6; }
.search-input { flex: 1; font-size: 26rpx; color: var(--text); }
.search-clear { font-size: 24rpx; color: var(--muted); padding: 0 6rpx; }
.search-chip {
  font-size: 24rpx;
  color: var(--sub);
  background: var(--fill);
  border-radius: var(--r-pill);
  padding: 14rpx 20rpx;
  white-space: nowrap;
}
.search-chip.on { background: var(--brand); color: #fff; }
`
}, '友圈搜索样式')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/moments/moments.js'])
console.log('  ✓ 语法通过')
