// 友圈搜索栏：默认收起，点搜索图标才展开
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

// ---------- 1. wxml ----------
edit('pages/moments/moments.wxml', t => {
  // 标题行加搜索图标
  t = t.replace(
    `    <view class="between section-title">
      <text>健身友圈</text>
      <button class="btn" bindtap="goPost">发一条</button>
    </view>`,
    `    <view class="between section-title">
      <text>健身友圈</text>
      <view class="row" style="gap:14rpx;align-items:center">
        <!-- 点这个图标才展开搜索栏 -->
        <view class="search-toggle {{searchOpen ? 'on' : ''}}" bindtap="toggleSearch">🔍</view>
        <button class="btn" bindtap="goPost">发一条</button>
      </view>
    </view>`
  )
  // 搜索栏默认隐藏
  t = t.replace(
    `    <!-- 搜索：输入 1 个字就开始预搜；可只看视频 -->
    <view class="search-bar">`,
    `    <!-- 搜索：点图标才展开；输入 1 个字就开始预搜；可只看视频 -->
    <view wx:if="{{searchOpen}}" class="search-bar">`
  )
  // 输入框自动聚焦 + 关闭按钮
  t = t.replace(
    `<input class="search-input" value="{{keyword}}" placeholder="搜内容 / 作者，1 个字就能搜"
          confirm-type="search" bindinput="onSearchInput" bindconfirm="onSearchConfirm" />`,
    `<input class="search-input" value="{{keyword}}" placeholder="搜内容 / 作者，1 个字就能搜"
          focus="{{searchOpen}}" confirm-type="search" bindinput="onSearchInput" bindconfirm="onSearchConfirm" />`
  )
  t = t.replace(
    `      <view class="search-chip {{onlyVideo ? 'on' : ''}}" bindtap="toggleVideoOnly">只看视频</view>
    </view>`,
    `      <view class="search-chip {{onlyVideo ? 'on' : ''}}" bindtap="toggleVideoOnly">只看视频</view>
      <text class="search-close" bindtap="toggleSearch">✕</text>
    </view>`
  )
  return t
}, 'wxml 搜索栏可收起')

// ---------- 2. js ----------
edit('pages/moments/moments.js', t => {
  t = t.replace(
    `    // 搜索：1 个字起就预搜；可以只看视频
    keyword: '', onlyVideo: false`,
    `    // 搜索：默认收起，点图标才展开；1 个字起就预搜；可以只看视频
    keyword: '', onlyVideo: false, searchOpen: false`
  )
  // 增加 toggleSearch（放在 onSearchInput 前）
  t = t.replace(
    `  // 输入即预搜（300ms 防抖）
  onSearchInput(e) {`,
    `  // 点搜索图标：展开/收起搜索栏；收起时清掉搜索条件并恢复全部
  toggleSearch() {
    const open = !this.data.searchOpen
    this.setData({ searchOpen: open })
    if (!open) {
      if (this.searchTimer) {
        clearTimeout(this.searchTimer)
        this.searchTimer = null
      }
      if (this.data.keyword || this.data.onlyVideo) {
        this.setData({ keyword: '', onlyVideo: false })
        this.reload()
      }
    }
  },

  // 输入即预搜（300ms 防抖）
  onSearchInput(e) {`
  )
  // 清空按钮：保留搜索栏展开
  t = t.replace(
    `  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ keyword: '', onlyVideo: false })
    this.reload()
  },`,
    `  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ keyword: '', onlyVideo: false })
    this.reload()
  },`
  )
  return t
}, 'js 增加 searchOpen 与切换')

// ---------- 3. wxss ----------
edit('pages/moments/moments.wxss', t => {
  if (t.includes('.search-toggle')) return t
  return t + `
/* 搜索图标：默认收起，点开才显示搜索栏 */
.search-toggle {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: var(--fill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
}
.search-toggle.on { background: var(--brand); }
.search-close {
  font-size: 26rpx;
  color: var(--muted);
  padding: 0 6rpx;
}
`
}, '样式：搜索图标')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/moments/moments.js'])
console.log('  ✓ 语法通过')
