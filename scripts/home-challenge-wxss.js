// 首页挑战模块样式
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.wxss'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('.challenge-home')) {
  console.log('· 已有样式')
  process.exit(0)
}

t += `
/* 首页挑战模块 */
.challenge-home { display: block; }
.challenge-todo { font-size: 26rpx; color: var(--brand-strong); }
.todo-tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 10rpx; }
.challenge-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; }
.challenge-link { font-size: 26rpx; color: var(--brand-strong); font-weight: 600; }
`

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 首页挑战模块样式已加')
