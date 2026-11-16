// 测试：相对力量三项缺项封顶 15 分
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('身体数据趋势返回一段时间的点')"

const extra = `  ok('身体数据趋势返回一段时间的点')

  // 相对力量：三项没录全时最多 15 分；三项齐全才按比例给到 40 分
  const CAP_ID = 'openid-scorecap'
  await ensureMember(CAP_ID)
  await act('updateProfile', CAP_ID, { nickName: '评分封顶测试', phone: '13800008888' })
  // 只录一项力量（卧推 100kg / 体重 70kg = 1.43 倍，若按比例本可拿不少分）
  await act('saveStrength', STAFF, { openid: CAP_ID, lift: 'bench', weight: 100, reps: 1 })
  await act('saveBodyRecord', STAFF, { openid: CAP_ID, weight: 70, height: 175, bodyFat: 15 })
  const oneLift = await act('memberFitness', COACH, { openid: CAP_ID })
  const oneDetail = (oneLift.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(oneDetail, '应包含相对力量明细')
  assert.ok(oneDetail.score <= 15, '三项没录全时相对力量最多 15 分，实际 ' + oneDetail.score)
  assert.ok(oneDetail.capped, '应标记为被封顶')
  assert.ok(/未录全/.test(oneDetail.note || ''), '应带说明文案')

  // 再补两项，三项齐全后不再封顶
  await act('saveStrength', STAFF, { openid: CAP_ID, lift: 'squat', weight: 150, reps: 1 })
  await act('saveStrength', STAFF, { openid: CAP_ID, lift: 'deadlift', weight: 180, reps: 1 })
  await act('saveBodyRecord', STAFF, { openid: CAP_ID, weight: 70, height: 175, bodyFat: 15 })
  const full2 = await act('memberFitness', COACH, { openid: CAP_ID })
  const fullDetail = (full2.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(fullDetail.score > 15, '三项齐全后可以超过 15 分，实际 ' + fullDetail.score)
  assert.ok(!fullDetail.capped, '三项齐全时不应标记封顶')
  assert.strictEqual(fullDetail.note, '', '三项齐全时没有封顶说明')
  ok('相对力量三项缺项时最多 15 分')`

if (t.includes('相对力量三项缺项时最多 15 分')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入封顶测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
