// 补回 activityTypeName
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('function activityTypeName')) {
  console.log('· 已存在')
  process.exit(0)
}

const anchor = '// ---------- 上传与展示限制 ----------'
const helper = `// 运动类型的显示名（管理页表格用）
function activityTypeName(key) {
  const names = {
    walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳',
    strength: '力量训练', class: '团课', other: '其他'
  }
  return names[key] || key
}

${anchor}`

if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
t = t.replace(anchor, helper)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 补回 activityTypeName')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
