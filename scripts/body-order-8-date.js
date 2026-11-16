// 排序改用「测量日期」字段 date（measured_at 是保存时间，补录旧日期时不可靠）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// 1. 历史列表
const q1 = `  // 按「测量时间」倒序，补录旧日期时也能排到正确位置
  const body = (await query(
    'select * from body_records where openid = $1 order by measured_at desc, created_at desc limit 20', [openid]
  )).rows.map(bodyRow)`
const n1 = `  // 按「测量日期」倒序（补录旧日期时也能排到正确位置），同一天按保存时间
  const body = (await query(
    'select * from body_records where openid = $1 order by date desc, created_at desc limit 20', [openid]
  )).rows.map(bodyRow)`
if (t.includes(q1)) { t = t.replace(q1, n1); done.push('历史列表按 date 排序') }
else console.log('⚠ 未匹配历史查询')

// 2. 删除后重算
const q2 = `      order by measured_at desc, created_at desc limit 1\`,
    [row.openid]`
const n2 = `      order by date desc, created_at desc limit 1\`,
    [row.openid]`
if (t.includes(q2)) { t = t.replace(q2, n2); done.push('删除后按 date 取最新') }
else console.log('⚠ 未匹配删除后查询')

// 3. 保存后取最新
const q3 = `      \`select * from body_records where openid = $1
        order by measured_at desc, created_at desc limit 1\`,
      [target._id]`
const n3 = `      \`select * from body_records where openid = $1
        order by date desc, created_at desc limit 1\`,
      [target._id]`
if (t.includes(q3)) { t = t.replace(q3, n3); done.push('保存后按 date 取最新') }
else console.log('⚠ 未匹配保存后查询')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
