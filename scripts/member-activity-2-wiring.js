// 服务端接线：新 action 注册、管理端运动记录接口、schema、canManageStrength
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// ---------- 1. ACTION_FEATURE 注册新 action ----------
edit('index.js', t => {
  t = t.replace(
    `  saveActivity: 'fitness',`,
    `  saveActivity: 'fitness',
  deleteActivity: 'fitness',
  deleteStrength: 'fitness',
  importActivity: 'fitness',`
  )
  return t
}, '注册新 action')

// ---------- 2. 管理端运动记录接口 ----------
edit('index.js', t => {
  if (t.includes("'/api/admin/activity'")) return t
  const anchor = '// ---------- 上传与展示限制 ----------'
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到插入锚点')
    return t
  }
  return t.replace(anchor, `// ---------- 运动记录管理（管理页） ----------
app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim()
    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const type = String(req.query.type || '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
    const where = []
    const args = []
    if (from) { args.push(from); where.push('a.date >= $' + args.length) }
    if (to) { args.push(to); where.push('a.date <= $' + args.length) }
    if (type) { args.push(type); where.push('a.type = $' + args.length) }
    if (keyword) {
      args.push('%' + keyword + '%')
      where.push('(m.nick_name ilike $' + args.length + ' or m.phone ilike $' + args.length +
        ' or a.openid ilike $' + args.length + ')')
    }
    args.push(limit)
    const sql = \`select a.*, m.nick_name, m.phone
                   from activity_records a left join members m on m.openid = a.openid
                  \${where.length ? 'where ' + where.join(' and ') : ''}
                  order by a.date desc, a.created_at desc
                  limit \$\${args.length}\`
    const rows = (await query(sql, args)).rows.map(r => ({
      id: r.id,
      openid: r.openid,
      name: r.nick_name || r.phone || r.openid.slice(0, 8),
      date: r.date,
      type: r.type,
      typeName: activityTypeName(r.type),
      steps: r.steps,
      distance: Number(r.distance) || 0,
      duration: r.duration,
      calories: r.calories,
      avgHr: r.avg_hr,
      source: r.source,
      operator: r.operator
    }))
    const total = (await query(
      \`select count(*)::int as n from activity_records a left join members m on m.openid = a.openid
        \${where.length ? 'where ' + where.join(' and ') : ''}\`,
      args.slice(0, -1)
    )).rows[0].n
    res.json({ code: 0, data: { rows, total, limit } })
  } catch (e) {
    console.error('admin activity list failed', e)
    res.json({ code: 500, msg: '读取运动记录失败' })
  }
})

app.delete('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const id = String((req.body && req.body.id) || req.query.id || '')
    if (!id) return res.json({ code: 400, msg: '缺少记录 ID' })
    const row = (await query('select date, type from activity_records where id = $1', [id])).rows[0]
    if (!row) return res.json({ code: 400, msg: '记录不存在或已删除' })
    await query('delete from activity_records where id = $1', [id])
    console.log('admin deleted activity', id)
    res.json({ code: 0, data: { id, date: row.date, type: row.type } })
  } catch (e) {
    console.error('admin activity delete failed', e)
    res.json({ code: 500, msg: '删除失败' })
  }
})

${anchor}`)
}, '新增管理端运动记录接口')

// ---------- 3. schema：external_id ----------
edit('schema.sql', t => {
  if (t.includes('external_id')) return t
  t = t.replace(
    `  source     text not null default 'staff',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_activity_openid on activity_records (openid, date desc);`,
    `  source     text not null default 'staff',
  external_id text not null default '',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_activity_openid on activity_records (openid, date desc);
-- 对接手机/手环/手表时用来去重（同来源同外部 ID 只留一条）
alter table activity_records add column if not exists external_id text not null default '';
create index if not exists idx_activity_external on activity_records (external_id);`
  )
  return t
}, 'schema 增加 external_id')

// ---------- 4. fitnessOf：告诉前端「能不能删力量成绩」 ----------
edit('lib/fitness.js', t => {
  if (t.includes('canManageStrength')) return t
  t = t.replace(
    `    actionTypes: activityTypeMeta()
  }`,
    `    actionTypes: activityTypeMeta(),
    // 只有管理员能删力量成绩（录错时用）
    canManageStrength: false
  }`
  )
  t = t.replace(
    `async function myFitness({ me }) {
  need(me, 'member')
  const fresh = memberRow((await query('select * from members where openid = $1', [me._id])).rows[0]) || me
  return fitnessOf(fresh, true)
}`,
    `async function myFitness({ me }) {
  need(me, 'member')
  const fresh = memberRow((await query('select * from members where openid = $1', [me._id])).rows[0]) || me
  const res = await fitnessOf(fresh, true)
  res.canManageStrength = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.admin
  return res
}`
  )
  t = t.replace(
    `async function memberFitness({ me, data }) {
  need(me, 'member')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  // 第二个参数是「是否隐藏身体明细」，现在对所有人可见
  return fitnessOf(target, true)
}`,
    `async function memberFitness({ me, data }) {
  need(me, 'member')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  // 第二个参数是「是否隐藏身体明细」，现在对所有人可见
  const res = await fitnessOf(target, true)
  res.canManageStrength = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.admin
  return res
}`
  )
  return t
}, 'fitnessOf 增加 canManageStrength')

// 需要 activityTypeName 帮助函数
edit('index.js', t => {
  if (t.includes('function activityTypeName')) return t
  t = t.replace(
    `// ---------- 上传与展示限制 ----------`,
    `function activityTypeName(key) {
  const names = {
    walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳',
    strength: '力量训练', class: '团课', other: '其他'
  }
  return names[key] || key
}

// ---------- 上传与展示限制 ----------`
  )
  return t
}, '活动类型名称帮助函数')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['index.js', 'lib/fitness.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
