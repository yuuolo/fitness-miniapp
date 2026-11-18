// 布局测试：默认会员布局 6 个模块，并包含挑战预览
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/layout.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (!t.includes('默认会员布局应包含挑战预览')) {
  t = t.replace('assert.strictEqual(def.member.length, 5)', 'assert.strictEqual(def.member.length, 6)')
  const anchor = "  assert.ok(def.member.some(b => b.type === 'competitions'), '默认会员布局应包含竞赛预览')"
  const extra = anchor + "\n  assert.ok(def.member.some(b => b.type === 'challenge'), '默认会员布局应包含挑战预览')"
  if (!t.includes(anchor)) {
    console.log('⚠ 找不到竞赛断言')
    process.exit(1)
  }
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 布局测试已更新')
} else {
  console.log('· 已更新')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
