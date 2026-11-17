// 友圈头部：删掉「健身友圈」标题，搜索图标移到左边
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/moments/moments.wxml'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    <view class="between section-title">
      <text>健身友圈</text>
      <view class="row" style="gap:14rpx;align-items:center">
        <!-- 点这个图标才展开搜索栏 -->
        <view class="search-toggle {{searchOpen ? 'on' : ''}}" bindtap="toggleSearch">🔍</view>
        <button class="btn" bindtap="goPost">发一条</button>
      </view>
    </view>`

const to = `    <!-- 头部：左边搜索图标（点开才出搜索栏），右边发一条；不再显示标题 -->
    <view class="moments-head">
      <view class="search-toggle {{searchOpen ? 'on' : ''}}" bindtap="toggleSearch">🔍</view>
      <button class="btn" bindtap="goPost">发一条</button>
    </view>`

if (!t.includes(from)) {
  console.log('⚠ 未匹配头部结构')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 头部已改：图标在左、标题删除')

// 样式
const W = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/moments/moments.wxss'
let wr = fs.readFileSync(W, 'utf8')
const wCRLF = wr.includes('\r\n')
let wt = wr.replace(/\r\n/g, '\n')
if (!wt.includes('.moments-head')) {
  wt = `/* 友圈头部：左搜索图标 + 右发一条，不放标题 */
.moments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8rpx 0 16rpx;
}
` + wt
  fs.writeFileSync(W, wCRLF ? wt.replace(/\n/g, '\r\n') : wt)
  console.log('✓ 样式 .moments-head 已加')
}
