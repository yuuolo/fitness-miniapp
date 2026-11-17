// 服务端：编辑项目时的安全校验
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/lift-items.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  if (key) {
    const existing = await getItem(key)
    if (!existing) fail('项目不存在')
    await query('update lift_items set name = $2, metric = $3, unit = $4, sort = $5 where key = $1',
      [key, name, metric, METRICS[metric].unit, sort])
    return getItem(key)
  }`

const to = `  if (key) {
    const existing = await getItem(key)
    if (!existing) fail('项目不存在')

    // 评分用的标准三项：比法必须是「估算 1RM」，否则三项合计（kg）算不出来
    if (SBD_KEYS.includes(key) && metric !== 'oneRM') {
      fail('卧推/深蹲/硬拉是身体评分用的标准项，比法不能改（只能改名称和排序）')
    }
    // 已经有成绩的项目改比法，会让历史数据对不上单位/口径
    if (metric !== existing.metric) {
      const used = (await query('select count(*)::int as n from strength_records where lift = $1', [key])).rows[0].n
      if (used > 0) {
        fail('这个项目已经有 ' + used + ' 条成绩，改比法会让历史成绩对不上；建议新建一个项目')
      }
    }

    await query('update lift_items set name = $2, metric = $3, unit = $4, sort = $5 where key = $1',
      [key, name, metric, METRICS[metric].unit, sort])
    return getItem(key)
  }`

if (!t.includes(from)) {
  console.log('⚠ 未匹配 save 的更新分支')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加编辑校验')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
