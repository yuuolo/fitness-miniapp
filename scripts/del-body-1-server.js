// 1) 服务端：教练/管理员可删除会员的历史身体资料（误传时用）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

if (t.includes('async function deleteBodyRecord')) {
  console.log('· 已有 deleteBodyRecord')
} else {
  const anchor = `// 一段时间内的身体数据变化，供趋势图/变化对比用
async function bodyTrend({ me, data }) {`

  const fn = `// 删除一条历史体测记录（教练/管理员，用于处理误传的资料）
// 删完要把会员档案上的「最新身体数据」重新算成剩下最新的一条
async function deleteBodyRecord({ me, data }) {
  need(me, 'coach')
  const id = String(data.id || '')
  if (!id) fail('缺少记录 id')

  const row = await one('select * from body_records where id = $1', [id])
  if (!row) fail('记录不存在')

  await query('delete from body_records where id = $1', [id])

  // 重新取这个会员剩下最新的一条
  const left = (await query(
    \`select * from body_records where openid = $1
      order by date desc, created_at desc limit 1\`,
    [row.openid]
  )).rows
  const remainRow = left[0] || null
  const member = memberRow((await query('select * from members where openid = $1', [row.openid])).rows[0])

  let latestBody = null
  if (remainRow && member) {
    latestBody = bodyRow(remainRow)
    const scored = scoreBody({
      gender: member.gender || latestBody.gender,
      weight: latestBody.weight,
      height: member.height || latestBody.height,
      bodyFat: latestBody.bodyFat,
      sbdTotal: sbdOf(member.bestLift)
    })
    latestBody.score = scored.score
    latestBody.detail = scored.detail
  }

  await query('update members set latest_body = $2 where openid = $1', [
    row.openid,
    latestBody ? JSON.stringify(latestBody) : null
  ])

  const rest = (await query(
    'select count(*)::int as n from body_records where openid = $1', [row.openid]
  )).rows[0].n

  return {
    deleted: true,
    openid: row.openid,
    date: row.date,
    remaining: rest,
    latestBody,
    memberName: member ? memberLabel(member) : ''
  }
}

` + anchor

  if (!t.includes(anchor)) {
    console.log('⚠ 找不到插入位置')
  } else {
    t = t.replace(anchor, fn)
    done.push('新增 deleteBodyRecord')
  }
}

// 导出
t = t.replace(
  '  saveBodyRecord, saveStrength, saveActivity,',
  '  saveBodyRecord, deleteBodyRecord, saveStrength, saveActivity,'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

// 确认导出
console.log('  导出检查: ' + (fs.readFileSync(P, 'utf8').includes('deleteBodyRecord, saveStrength') ? 'ok' : '缺失'))
