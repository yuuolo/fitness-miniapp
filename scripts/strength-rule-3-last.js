// 补第 4 处（最新档案重算）的 sbdMissing
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const idx = t.indexOf('gender: gender || latestBody.gender')
if (idx < 0) {
  console.log('⚠ 找不到该调用')
  process.exit(1)
}
// 取这次调用的片段
const seg = t.slice(idx, idx + 400)
if (seg.includes('sbdMissing')) {
  console.log('· 已有 sbdMissing')
  process.exit(0)
}
const from = 'sbdTotal: sbdOf(target.bestLift),\n    sbdCount: sbdCountOf(target.bestLift)\n  })'
const to = 'sbdTotal: sbdOf(target.bestLift),\n    sbdCount: sbdCountOf(target.bestLift),\n    sbdMissing: sbdMissingOf(target.bestLift)\n  })'
if (!seg.includes(from)) {
  console.log('⚠ 片段未匹配，实际内容：')
  console.log(seg)
  process.exit(1)
}
t = t.slice(0, idx) + seg.replace(from, to) + t.slice(idx + seg.length)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 第 4 处已补')

const after = fs.readFileSync(P, 'utf8')
console.log('  带 sbdMissing: ' + (after.match(/sbdMissing: sbdMissingOf/g) || []).length + ' / ' +
  (after.match(/scoreBody\(\{/g) || []).length)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
