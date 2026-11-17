// 重算脚本加 --force（分数没变也重写明细，保证说明文案是最新的）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/scripts/recompute-scores.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes("argv.includes('--force')")) {
  console.log('· 已有 force')
  process.exit(0)
}

t = t.replace(
  "  const dry = process.argv.includes('--dry')",
  "  const dry = process.argv.includes('--dry')\n  // --force：即使总分没变，也重写明细（说明文案会随规则更新）\n  const force = process.argv.includes('--force')"
)

t = t.replace(
  "    if (latest.score === scored.score) { skipped++; continue }",
  "    if (!force && latest.score === scored.score && JSON.stringify(latest.detail) === JSON.stringify(scored.detail)) { skipped++; continue }"
)

t = t.replace(
  "    if (b.score === scored.score) continue",
  "    if (!force && b.score === scored.score) continue"
)

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加 --force')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
