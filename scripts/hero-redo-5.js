// 跑步：把「踢小腿」放到腿在身后的时候，并让前摆更充分
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `      // 右腿相位 phi，左腿反相
      const thighR = 0.85 * Math.sin(phi)
      // 屈膝峰值放在「蹬地之后」，后腿小腿明显向上翘
      const flexR = 0.12 + 1.85 * clamp01(Math.cos(phi - 5.75))
      const thighL = 0.85 * Math.sin(phi + Math.PI)
      const flexL = 0.12 + 1.85 * clamp01(Math.cos(phi + Math.PI - 5.75))`

const to = `      // 右腿相位 phi，左腿反相。
      // 大腿整体相位后移 0.45，让「腿在身后 + 小腿高抬」同时发生，像真正的后踢腿
      const PH = 0.45
      const thighR = 0.9 * Math.sin(phi - PH)
      const flexR = 0.12 + 1.8 * clamp01(Math.cos(phi - 5.16))
      const thighL = 0.9 * Math.sin(phi + Math.PI - PH)
      const flexL = 0.12 + 1.8 * clamp01(Math.cos(phi + Math.PI - 5.16))`

if (!t.includes(from)) {
  console.log('⚠ 未匹配跑步参数')
} else {
  t = t.replace(from, to)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('  ✓ 跑步相位已调整')
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
