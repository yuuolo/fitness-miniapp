// 前端：待判决阶段也允许继续上传视频
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges/detail/detail.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = "    const open = c.status === 'accepted' || c.status === 'waiting_referee'"
const to = "    const open = ['accepted', 'waiting_referee', 'ready'].indexOf(c.status) >= 0"

if (!t.includes(from)) {
  console.log('· 未匹配（可能已改）')
} else {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 前端开放 ready 阶段上传')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
