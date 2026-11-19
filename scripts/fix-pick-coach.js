// 修测试：新块里自己建一个教练，别引用上一个块的 COACH3
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = [
  "    const M1 = 'openid-pick-me'",
  "    const M2 = 'openid-pick-other'",
  '    for (const id of [M1, M2]) await ensureMember(id)'
].join('\n')

const to = [
  "    const M1 = 'openid-pick-me'",
  "    const M2 = 'openid-pick-other'",
  "    const PICK_COACH = 'openid-pick-coach'",
  '    for (const id of [M1, M2, PICK_COACH]) await ensureMember(id)',
  "    await act('setRole', ADMIN, { openid: PICK_COACH, role: 'coach' })"
].join('\n')

if (!t.includes(from)) {
  console.log('⚠ 未匹配块开头')
  process.exit(1)
}
t = t.replace(from, to)
t = t.replace("referee: COACH3 || 'openid-coach3'", 'referee: PICK_COACH')

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修好裁判引用')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
