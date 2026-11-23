// 补详情页视频网格样式
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges/detail/detail.wxss'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('.video-grid')) {
  console.log('· 已有样式')
  process.exit(0)
}

t += `
/* 双方视频列表（每方最多 9 段） */
.video-block { padding: 6rpx 0 18rpx; border-bottom: 1rpx solid var(--line); }
.video-block:last-of-type { border-bottom: none; }
.video-head { margin-bottom: 10rpx; }
.video-side-name { font-size: 28rpx; font-weight: 600; color: var(--ink); }
.video-add {
  font-size: 24rpx; color: var(--brand-strong); background: var(--brand-soft);
  border-radius: var(--r-pill); padding: 8rpx 20rpx;
}
.video-empty { padding: 12rpx 0; }
.video-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.video-cell { width: 31%; }
.video-cell .video-box { height: 150rpx; margin-top: 0; }
.video-meta { margin-top: 4rpx; }
`

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 样式已补')
