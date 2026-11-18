// judgeChallenge 的权限门槛改成 member + 裁判校验（报错更准，管理员可兜底）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/challenge.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = [
  'async function judgeChallenge({ me, data }) {',
  "  need(me, 'coach')"
].join('\n')

const to = [
  'async function judgeChallenge({ me, data }) {',
  '  // 用 member 门槛 + 裁判校验：普通会员会看到「只有主裁判能判定」，而不是笼统的「没有权限」',
  "  need(me, 'member')"
].join('\n')

if (t.includes(to)) {
  console.log('· 已改过')
  process.exit(0)
}
if (!t.includes(from)) {
  console.log('⚠ 未匹配 judgeChallenge 权限行')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ judgeChallenge 权限已改')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
