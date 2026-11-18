// 布局测试：describe().blocks 从 6 种变成 7 种
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/layout.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = "  assert.strictEqual(meta.blocks.length, 6, '可选模块只剩 6 种')"
const to = "  assert.strictEqual(meta.blocks.length, 7, '可选模块只剩 7 种')"

if (t.includes(to)) {
  console.log('· 已更新')
} else if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
} else {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ meta.blocks 断言改为 7')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
