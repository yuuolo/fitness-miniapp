// 清掉文件末尾残留的旧代码（第一次插入失败留下的片段）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/moment.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let lines = raw.replace(/\r\n/g, '\n').split('\n')

// 找 module.exports 块的结束位置，之后如果还有内容就说明是残留
const expIdx = lines.findIndex(l => l.indexOf('module.exports') >= 0)
if (expIdx < 0) {
  console.log('⚠ 找不到 module.exports')
  process.exit(1)
}
let endIdx = expIdx
while (endIdx < lines.length && lines[endIdx].trim() !== '}') endIdx++

const tail = lines.slice(endIdx + 1).filter(l => l.trim() !== '')
console.log('导出块之后残留行数: ' + tail.length)
if (tail.length) {
  console.log('前几行: ' + JSON.stringify(tail.slice(0, 3)))
  lines = lines.slice(0, endIdx + 1)
  // 保留一个结尾换行
  lines.push('')
  fs.writeFileSync(P, CRLF ? lines.join('\r\n') : lines.join('\n'))
  console.log('✓ 已清理残留')
} else {
  console.log('· 没有残留')
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')

const after = fs.readFileSync(P, 'utf8')
console.log('  momentList 出现次数: ' + (after.match(/async function momentList/g) || []).length)
console.log('  module.exports 出现次数: ' + (after.match(/module\.exports/g) || []).length)
