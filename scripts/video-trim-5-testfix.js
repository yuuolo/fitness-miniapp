// 修测试里的 fs 引用
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = "  for (const f of [src, cut.path, cut10.path]) fs.rmSync(f, { force: true })"
const to = "  for (const f of [src, cut.path, cut10.path]) require('fs').rmSync(f, { force: true })"

if (t.includes(from)) {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已修')
} else {
  console.log('⚠ 未匹配')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
