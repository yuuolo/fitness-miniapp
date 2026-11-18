// 测试模块清单加 subscriptions
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = "for (const name of ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge']) {"
const to = "for (const name of ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge', 'subscriptions']) {"

if (t.includes(to)) {
  console.log('· 已包含')
} else if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
} else {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 测试模块清单加 subscriptions')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
