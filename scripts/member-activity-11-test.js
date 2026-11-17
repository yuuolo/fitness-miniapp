// 测试：删除力量成绩 / 会员自己录运动 / 删除运动 / 批量导入去重
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('限制可放开：支持 > 60 秒，0 表示不限')"

const extra = `  ok('限制可放开：支持 > 60 秒，0 表示不限')

  // 管理员可以删除力量成绩，删完最好成绩与评分自动重算
  const DEL_ID = 'openid-strengthdel'
  await ensureMember(DEL_ID)
  await act('updateProfile', DEL_ID, { nickName: '删成绩测试', phone: '13800006611' })
  await act('saveBodyRecord', STAFF, { openid: DEL_ID, weight: 80, height: 180, bodyFat: 18 })
  await act('saveStrength', STAFF, { openid: DEL_ID, lift: 'bench', weight: 100, reps: 1 })
  const afterFirst = await act('memberFitness', COACH, { openid: DEL_ID })
  assert.ok(afterFirst.bestLift.bench, '应先有卧推成绩')

  const before = await query('select id, one_rm from strength_records where openid = $1 and lift = $2', [DEL_ID, 'bench'])
  assert.strictEqual(before.rows.length, 1)
  // 教练不能删，管理员可以
  await expectFail(() => act('deleteStrength', COACH, { id: before.rows[0].id }), '权限', '教练不能删力量成绩')
  const delRes = await act('deleteStrength', ADMIN, { id: before.rows[0].id })
  assert.strictEqual(delRes.removed.lift, 'bench')
  assert.ok(!delRes.bestLift.bench, '删除后不该还留着卧推最好成绩')
  const afterDel = await act('memberFitness', COACH, { openid: DEL_ID })
  assert.ok(!afterDel.bestLift.bench, '接口返回里也应没有卧推成绩')
  assert.strictEqual(Number(afterDel.sbdTotal), 0, '三项合计应归零')

  // 删掉成绩后评分里也不再有相对力量这一项
  const scoreDetail = (afterDel.latestBody && afterDel.latestBody.detail) || []
  assert.ok(!scoreDetail.some(d => d.key === 'strength'), '没有力量成绩时评分不该有相对力量项')
  ok('管理员可以删除力量成绩，最好成绩与评分自动重算')

  // 会员可以自己录运动
  const ACT_ID = 'openid-selfactivity'
  await ensureMember(ACT_ID)
  await act('updateProfile', ACT_ID, { nickName: '自己记运动', phone: '13800005522' })
  const saved = await act('saveActivity', ACT_ID, { type: 'run', distance: 5.2, duration: 32 })
  assert.ok(saved._id, '会员应能自己保存运动记录')
  const mine = await act('myFitness', ACT_ID)
  assert.ok((mine.activity || []).length >= 1, '自己录的运动应出现在我的数据里')
  assert.strictEqual(mine.activity[0].source, 'self', '自己录的来源应为 self')

  // 教练仍然可以代录别人的
  const coachSaved = await act('saveActivity', STAFF, { openid: ACT_ID, type: 'walk', steps: 9000 })
  assert.ok(coachSaved._id, '教练应能给别人代录')
  assert.strictEqual(coachSaved.source, 'staff', '代录来源应为 staff')

  // 删除：自己删自己的可以，删别人的不行
  const mine2 = await act('myFitness', ACT_ID)
  const runRecord = (mine2.activity || []).find(a => a.type === 'run')
  await expectFail(() => act('deleteActivity', 'openid-member', { id: runRecord._id }), '只能删除自己', '不能删别人的运动')
  const delAct = await act('deleteActivity', ACT_ID, { id: runRecord._id })
  assert.strictEqual(delAct.type, 'run')
  const mine3 = await act('myFitness', ACT_ID)
  assert.ok(!(mine3.activity || []).some(a => a.type === 'run'), '删掉后不该还有跑步记录')
  ok('会员可以自己记录运动（教练仍可代录），并能删除自己的记录')

  // 批量导入（设备/手环对接用）按外部 ID 去重
  const imp1 = await act('importActivity', ADMIN, {
    items: [
      { openid: ACT_ID, date: '2026-11-10', type: 'run', distance: 8, duration: 45, source: 'apple_health', externalId: 'hk-1' },
      { openid: ACT_ID, date: '2026-11-11', type: 'walk', steps: 12000, source: 'huawei_health', externalId: 'hw-1' }
    ]
  })
  assert.strictEqual(imp1.imported, 2, '应导入 2 条')
  const imp2 = await act('importActivity', ADMIN, {
    items: [
      { openid: ACT_ID, date: '2026-11-10', type: 'run', distance: 8.5, duration: 46, source: 'apple_health', externalId: 'hk-1' }
    ]
  })
  assert.strictEqual(imp2.updated, 1, '同一外部 ID 再导入应更新而不是新增')
  const imported = await query(
    "select count(*)::int as n from activity_records where openid = $1 and source in ('apple_health','huawei_health')",
    [ACT_ID]
  )
  assert.strictEqual(imported.rows[0].n, 2, '导入后应正好 2 条，不能重复堆积')
  await expectFail(() => act('importActivity', COACH, { items: [{ openid: ACT_ID }] }), '权限', '教练不能批量导入')
  ok('批量导入运动数据（按外部 ID 去重）')`

if (t.includes('批量导入运动数据（按外部 ID 去重）')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
