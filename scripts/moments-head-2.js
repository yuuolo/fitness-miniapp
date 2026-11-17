// 友圈头部：让「发一条」按钮按内容宽度（微信 button 默认宽 184px，显得很宽）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/moments/moments.wxss'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('.moments-head .btn')) {
  console.log('· 已有宽度覆盖')
  process.exit(0)
}

t = t.replace(
  `.moments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8rpx 0 16rpx;
}`,
  `.moments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8rpx 0 16rpx;
}
/* 微信 button 默认宽度 184px，这里按内容自适应，靠右放 */
.moments-head .btn {
  width: auto;
  padding: 0 32rpx;
}`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 按钮宽度改为自适应')
