// 关键修正：代理必须放在 express.json 之前，否则 JSON body 会被先消费掉，转发过去是空的
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const startMark = '// ---------- 测试环境反代（体验版专用） ----------'
const endMark = "  console.log('staging proxy enabled ->', stagingUrl)\n}"
const start = t.indexOf(startMark)
const end = t.indexOf(endMark)
if (start < 0 || end < 0) {
  console.log('⚠ 找不到代理块')
  process.exit(1)
}
const block = t.slice(start, end + endMark.length)
// 从原位置移除
t = t.slice(0, start) + t.slice(end + endMark.length)
// 清理多余空行
t = t.replace(/\n{3,}/g, '\n\n')

// 插到 express.json 之前
const jsonLine = `app.use(express.json({ limit: '2mb' }))`
if (!t.includes(jsonLine)) {
  console.log('⚠ 找不到 express.json')
  process.exit(1)
}
t = t.replace(jsonLine, block + '\n\n' + jsonLine)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 代理已移到 express.json 之前')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
