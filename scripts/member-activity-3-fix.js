// 修：管理端运动记录接口被拼坏了，重写成干净版本（不用嵌套模板字符串）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// 删掉从「运动记录管理（管理页）」注释开始、到 media-limits 注释之前的所有内容
const startMark = '// ---------- 运动记录管理（管理页） ----------'
const endMark = "// ---------- 上传与展示限制 ----------"
const s = t.indexOf(startMark)
const e = t.indexOf(endMark)
if (s < 0) {
  console.log('⚠ 找不到起始标记')
  process.exit(1)
}
if (e < 0) {
  console.log('⚠ 找不到结束标记')
  process.exit(1)
}

const block = [
  '// ---------- 运动记录管理（管理页） ----------',
  "app.get('/api/admin/activity', requireAdmin, async (req, res) => {",
  '  try {',
  "    const keyword = String(req.query.keyword || '').trim()",
  "    const from = String(req.query.from || '').trim()",
  "    const to = String(req.query.to || '').trim()",
  "    const type = String(req.query.type || '').trim()",
  '    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)',
  '    const where = []',
  '    const args = []',
  '    if (from) { args.push(from); where.push(\'a.date >= $\' + args.length) }',
  '    if (to) { args.push(to); where.push(\'a.date <= $\' + args.length) }',
  '    if (type) { args.push(type); where.push(\'a.type = $\' + args.length) }',
  '    if (keyword) {',
  "      args.push('%' + keyword + '%')",
  '      where.push(\'(m.nick_name ilike $\' + args.length + \' or m.phone ilike $\' + args.length +',
  "        ' or a.openid ilike $' + args.length + ')')",
  '    }',
  '    const cond = where.length ? \' where \' + where.join(\' and \') : \'\'',
  '    const selectArgs = args.concat([limit])',
  '    const sql = \'select a.*, m.nick_name, m.phone from activity_records a \' +',
  '      \'left join members m on m.openid = a.openid\' + cond +',
  '      \' order by a.date desc, a.created_at desc limit $\' + selectArgs.length',
  '    const rows = (await query(sql, selectArgs)).rows.map(r => ({',
  '      id: r.id,',
  '      openid: r.openid,',
  "      name: r.nick_name || r.phone || String(r.openid || '').slice(0, 8),",
  '      date: r.date,',
  '      type: r.type,',
  '      typeName: activityTypeName(r.type),',
  '      steps: r.steps,',
  '      distance: Number(r.distance) || 0,',
  '      duration: r.duration,',
  '      calories: r.calories,',
  '      avgHr: r.avg_hr,',
  '      source: r.source,',
  '      operator: r.operator',
  '    }))',
  '    const countSql = \'select count(*)::int as n from activity_records a \' +',
  '      \'left join members m on m.openid = a.openid\' + cond',
  '    const total = (await query(countSql, args)).rows[0].n',
  '    res.json({ code: 0, data: { rows, total, limit } })',
  '  } catch (e) {',
  "    console.error('admin activity list failed', e)",
  "    res.json({ code: 500, msg: '读取运动记录失败' })",
  '  }',
  '})',
  '',
  "app.delete('/api/admin/activity', requireAdmin, async (req, res) => {",
  '  try {',
  "    const id = String((req.body && req.body.id) || req.query.id || '')",
  "    if (!id) return res.json({ code: 400, msg: '缺少记录 ID' })",
  "    const row = (await query('select date, type from activity_records where id = $1', [id])).rows[0]",
  "    if (!row) return res.json({ code: 400, msg: '记录不存在或已删除' })",
  "    await query('delete from activity_records where id = $1', [id])",
  "    console.log('admin deleted activity', id)",
  '    res.json({ code: 0, data: { id, date: row.date, type: row.type } })',
  '  } catch (e) {',
  "    console.error('admin activity delete failed', e)",
  "    res.json({ code: 500, msg: '删除失败' })",
  '  }',
  '})',
  '',
  ''
].join('\n')

t = t.slice(0, s) + block + t.slice(e)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已重写管理端运动记录接口')

// 顺便去掉重复导出的 scoreBody/bmiOf
const F = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let fr = fs.readFileSync(F, 'utf8')
const fCRLF = fr.includes('\r\n')
let ft = fr.replace(/\r\n/g, '\n')
ft = ft.replace(
  `  parseBodyReport, ocrBodyReport,
  // 供内部/测试复用
  scoreBody, oneRM, bmiOf, LIFTS
}`,
  `  parseBodyReport, ocrBodyReport,
  // 供内部/测试复用
  oneRM, LIFTS
}`
)
fs.writeFileSync(F, fCRLF ? ft.replace(/\n/g, '\r\n') : ft)
console.log('✓ 已清理重复导出')

require('child_process').execFileSync(process.execPath, ['--check', P])
require('child_process').execFileSync(process.execPath, ['--check', F])
console.log('✓ 语法通过')
