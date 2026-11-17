// 补第 4 处（缩进是 6/8 空格）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `        bodyFat: latestBody.bodyFat,
        sbdTotal: sbdOf(target.bestLift),
        sbdCount: sbdCountOf(target.bestLift)
      })`
const to = `        bodyFat: latestBody.bodyFat,
        sbdTotal: sbdOf(target.bestLift),
        sbdCount: sbdCountOf(target.bestLift),
        sbdMissing: sbdMissingOf(target.bestLift)
      })`

if (t.includes(from)) {
  t = t.replace(from, to)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已补第 4 处')
} else {
  console.log('⚠ 未匹配')
}

const after = fs.readFileSync(P, 'utf8')
console.log('  带 sbdMissing: ' + (after.match(/sbdMissing: sbdMissingOf/g) || []).length + ' / ' +
  (after.match(/scoreBody\(\{/g) || []).length)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
