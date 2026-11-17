// 删除多余的右括号（用行号定位，避免引号转义）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let lines = raw.replace(/\r\n/g, '\n').split('\n')

const okIdx = lines.findIndex(l => l.indexOf('排行榜项目可以编辑') >= 0)
if (okIdx < 0) {
  console.log('⚠ 找不到编辑块的 ok 行')
  process.exit(1)
}
// 期望结构：ok 行 → "  }" → "  }"（多余的）→ 空行
const a = lines[okIdx + 1]
const b = lines[okIdx + 2]
const c = lines[okIdx + 3]
console.log('后续三行: ' + JSON.stringify([a, b, c]))

if (a.trim() === '}' && b.trim() === '}' && c.trim() === '') {
  lines.splice(okIdx + 2, 1)
  fs.writeFileSync(p, CRLF ? lines.join('\r\n') : lines.join('\n'))
  console.log('✓ 已删除多余的右括号')
} else {
  console.log('⚠ 结构不符合预期，请手动检查')
  process.exit(1)
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
