// 硬拉幅度加大：杠铃从地面拉到髋部，行程 36px
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `      const ankle = [52, 102]
      const knee = [lerp(58, 55), lerp(80, 80)]
      const hip = [lerp(40, 48), lerp(74, 62)]
      const shoulder = [lerp(62, 58), lerp(64, 40)]
      const head = [lerp(74, 66), lerp(58, 34)]
      const hand = [lerp(66, 61), lerp(96, 68)]`

const to = `      // 底部：杠铃贴地（y=100），躯干接近水平；顶部：站直，杠到大腿/髋（y=64）
      const ankle = [52, 102]
      const knee = [lerp(58, 56), lerp(82, 80)]
      const hip = [lerp(36, 48), lerp(78, 62)]
      const shoulder = [lerp(66, 58), lerp(70, 36)]
      const head = [lerp(80, 64), lerp(62, 30)]
      const hand = [lerp(70, 61), lerp(100, 64)]`

if (!t.includes(from)) {
  console.log('⚠ 未匹配硬拉参数')
} else {
  t = t.replace(from, to)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('  ✓ 硬拉行程加大')
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
