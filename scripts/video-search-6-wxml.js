// 友圈 wxml：搜索栏插到「健身友圈 / 发一条」标题下面
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/moments/moments.wxml'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('search-bar')) {
  console.log('· 已有搜索栏')
  process.exit(0)
}

const from = `    <view class="between section-title">
      <text>健身友圈</text>
      <button class="btn" bindtap="goPost">发一条</button>
    </view>`

const to = `    <view class="between section-title">
      <text>健身友圈</text>
      <button class="btn" bindtap="goPost">发一条</button>
    </view>

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

if (!t.includes(from)) {
  console.log('⚠ 找不到标题块')
  process.exit(1)
}
t = t.replace(from, to)

// 空状态文案：搜索无结果时提示不一样
t = t.replace(
  `    <view wx:if="{{loaded && !list.length}}" class="card">
      <view class="muted">还没有人发动态。训练完随手拍一段，或者让教练帮你拍。</view>
    </view>`,
  `    <view wx:if="{{loaded && !list.length}}" class="card">
      <view wx:if="{{keyword || onlyVideo}}" class="muted">没有搜到相关动态，换个词试试（或关掉「只看视频」）。</view>
      <view wx:else class="muted">还没有人发动态。训练完随手拍一段，或者让教练帮你拍。</view>
    </view>`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加搜索栏')
