// 把 SBD_KEYS 提前到 save 之前，避免阅读上的疑惑
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/lift-items.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const defLine = "const SBD_KEYS = ['bench', 'squat', 'deadlift']"
const defBlock = `// 身体评分（SBD 合计）用的标准三项：不能删除，可以隐藏
${defLine}
const SBD_REASON = '身体评分用的是「卧推+深蹲+硬拉」三项合计，删掉会算不出来；用不上可以隐藏'`

if (!t.includes(defBlock)) {
  console.log('· 定义块结构不同，跳过移动')
} else {
  // 删掉原位置
  t = t.replace(defBlock + '\n\n', '')
  t = t.replace(defBlock, '')
  // 插到 save 之前
  const anchor = 'async function save({ me, data }) {'
  t = t.replace(anchor, `// 身体评分（SBD 合计）用的标准三项：比法固定为「估算 1RM」，不能删除\n${defLine}\nconst SBD_REASON = '身体评分用的是「卧推+深蹲+硬拉」三项合计，删掉会算不出来；用不上可以隐藏'\n\n${anchor}`)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ SBD_KEYS 已提前')
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
const after = fs.readFileSync(P, 'utf8')
console.log('  SBD_KEYS 出现次数: ' + (after.match(/const SBD_KEYS/g) || []).length)
