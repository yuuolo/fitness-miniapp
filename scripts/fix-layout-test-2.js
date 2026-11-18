// 布局测试：默认会员布局现在是 6 个（加了挑战预览）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/layout.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const fixes = [
  ['  assert.strictEqual(fresh.roles.member.length, 5)', '  assert.strictEqual(fresh.roles.member.length, 6)'],
  ['  assert.strictEqual(memberBlocks.length, 5)', '  assert.strictEqual(memberBlocks.length, 6)']
]

let changed = 0
for (const [from, to] of fixes) {
  if (t.includes(from)) {
    t = t.replace(from, to)
    changed++
  }
}

if (!changed) {
  console.log('· 无需修改')
} else {
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 更新了 ' + changed + ' 处默认数量断言')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
