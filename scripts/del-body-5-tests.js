// 测试：删除历史体测记录（教练可删、会员不可）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('身体数据趋势返回一段时间的点')"

const extra = `  ok('身体数据趋势返回一段时间的点')

  // 误传资料要能删：教练/管理员可删历史体测，删完最新档案自动换成剩下最新的一条
  const DEL_ID = 'openid-bodydel'
  await ensureMember(DEL_ID)
  await act('updateProfile', DEL_ID, { nickName: '误传会员', phone: '13800007777' })
  await act('saveBodyRecord', STAFF, { openid: DEL_ID, weight: 70, height: 175, bodyFat: 20, date: '2026-01-10' })
  await act('saveBodyRecord', STAFF, { openid: DEL_ID, weight: 88, height: 175, bodyFat: 30, date: '2026-02-10' })
  const before = (await query(
    "select id, date from body_records where openid = $1 order by date desc", [DEL_ID]
  )).rows
  assert.strictEqual(before.length, 2, '应该有两条体测记录')
  assert.strictEqual(
    (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body.date,
    '2026-02-10'
  )

  await expectFail(
    () => act('deleteBodyRecord', MEMBER, { id: before[0].id }),
    '没有权限', '普通会员不能删别人的体测记录'
  )

  const delRes = await act('deleteBodyRecord', COACH, { id: before[0].id })
  assert.strictEqual(delRes.remaining, 1, '删完应只剩一条')
  const latestAfter = (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body
  assert.strictEqual(latestAfter.date, '2026-01-10', '最新档案应换成剩下那条')
  assert.strictEqual(Number(latestAfter.weight), 70, '最新档案的体重也要跟着换')
  assert.ok(latestAfter.score > 0, '换完之后评分要重算')

  // 管理员也能删，删到没有记录时最新档案清空
  await act('deleteBodyRecord', ADMIN, { id: before[1].id })
  const emptyLatest = (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body
  assert.strictEqual(emptyLatest, null, '记录删完最新档案应为空')
  ok('教练/管理员可以删除历史体测，最新档案与评分自动重算')

  // 报告图随识别自动保存：saveBodyRecord 带 reportImage 时应写进记录
  const withReport = await act('saveBodyRecord', STAFF, {
    openid: DEL_ID, weight: 71, height: 175, bodyFat: 19,
    reportImage: 'https://gym.novrein.com/api/media/report-demo', date: '2026-03-01'
  })
  assert.strictEqual(withReport.reportImage, 'https://gym.novrein.com/api/media/report-demo')
  const reportRow = (await query(
    "select report_image from body_records where openid = $1 and date = '2026-03-01'", [DEL_ID]
  )).rows[0]
  assert.strictEqual(reportRow.report_image, 'https://gym.novrein.com/api/media/report-demo', '报告图要存进记录')
  ok('体测报告图会随记录保存')`

if (t.includes('教练/管理员可以删除历史体测')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入删除体测 + 报告图测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
