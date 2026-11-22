// 1) 服务端：新增 bodyHistory（给单指标历史曲线用，返回全部历史）
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
let raw = fs.readFileSync(SERVER + '/lib/fitness.js', 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('async function bodyHistory')) {
  console.log('· bodyHistory 已存在')
} else {
  const anchor = '// ---------- 力量成绩 ----------'
  const block = `// 全部历史体测（含评分实时重算）：给单指标历史曲线、最近两次对比用
async function bodyHistory({ me, data }) {
  need(me, 'member')
  const asStaff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.admin
  const openid = data.openid && asStaff ? data.openid : me._id

  const rows = (await query(
    \`select * from body_records where openid = $1
      order by date asc, created_at asc limit 500\`, [openid]
  )).rows.map(bodyRow)

  const m = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  const records = m ? rows.map(b => withScore(m, b)) : rows

  // 最新/上一次 与 各指标是否有值，前端用来做对比
  return {
    count: records.length,
    latestDate: records.length ? records[records.length - 1].date : '',
    prevDate: records.length > 1 ? records[records.length - 2].date : '',
    records
  }
}

` + anchor
  if (!t.includes(anchor)) {
    console.log('⚠ 未找到锚点')
    process.exit(1)
  }
  t = t.replace(anchor, block)

  // 导出
  t = t.replace(/(\n {2}myFitness,)/, '\n  myFitness,\n  bodyHistory,')
  fs.writeFileSync(SERVER + '/lib/fitness.js', CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ fitness.js 新增 bodyHistory')
}

require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/lib/fitness.js'])
console.log('✓ 语法通过')

// 2) index.js 注册 action（功能开关跟 fitness 走）
let idx = fs.readFileSync(SERVER + '/index.js', 'utf8')
const idxCRLF = idx.includes('\r\n')
let ix = idx.replace(/\r\n/g, '\n')
if (!ix.includes('bodyHistory:')) {
  ix = ix.replace(/(\n {2}bodyTrend: '[^']*',)/, "$1\n  bodyHistory: 'fitness',")
  fs.writeFileSync(SERVER + '/index.js', idxCRLF ? ix.replace(/\n/g, '\r\n') : ix)
  console.log('✓ index.js 注册 bodyHistory')
}
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/index.js'])
console.log('✓ index.js 语法通过')
