// 测试保护：拒绝在生产库上运行
//
// 背景：这些测试会清空数据表（run.js / competition.js 会 truncate）。
// 曾经因为直接在 server 容器里 `node test/run.js`（DATABASE_URL 指向生产库 gym），
// 把真实数据清掉了。这里加一道硬性拦截，任何测试文件开头 require 一次即可。
const url = process.env.DATABASE_URL || ''
const dbName = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || ''

const PRODUCTION_NAMES = ['gym', 'postgres', '']

if (PRODUCTION_NAMES.includes(dbName)) {
  console.error('')
  console.error('============================================================')
  console.error('  已拒绝执行：测试不能跑在库 "' + (dbName || '(未指定)') + '" 上')
  console.error('')
  console.error('  这些测试会清空数据表，生产库只能跑只读检查。')
  console.error('  正确做法：用 deploy/scripts/run-tests.sh 等脚本，')
  console.error('  它们会为每套测试创建独立数据库（gym_layout / gym_http ...）。')
  console.error('============================================================')
  console.error('')
  process.exit(1)
}

module.exports = { dbName }
