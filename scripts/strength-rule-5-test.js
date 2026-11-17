// 更新测试：新的相对力量规则（0 项=0，1 项≤13.3，2 项≤26.7，3 项=40）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const oldBlock = `  // 相对力量：三项没录全时最多 15 分；三项齐全才按比例给到 40 分
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

const newBlock = `  // 相对力量：三项各占三分之一
  // 0 项 = 0 分（分母仍算 40）；1 项 ≤ 13.3；2 项 ≤ 26.7；3 项 = 40
  {
    const capId = 'openid-scorecap'
    await ensureMember(capId)
    await act('updateProfile', capId, { nickName: '评分封顶测试', phone: '13800008888' })

    // 一项都没有：记 0 分，且带着说明
    await act('saveBodyRecord', STAFF, { openid: capId, weight: 70, height: 175, bodyFat: 15 })
    const zeroFit = await act('memberFitness', COACH, { openid: capId })
    const zeroDetail = (zeroFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.ok(zeroDetail, '没录力量时也要有相对力量这一项（记 0 分）')
    assert.strictEqual(zeroDetail.score, 0, '一项都没录时相对力量应为 0 分')
    assert.ok(/先按 0 分算/.test(zeroDetail.note || ''), '应说明还没录成绩')

    // 只录一项卧推（100kg / 体重 70kg = 1.43 倍）：上限 40/3 = 13.3
    await act('saveStrength', STAFF, { openid: capId, lift: 'bench', weight: 100, reps: 1 })
    const oneFit = await act('memberFitness', COACH, { openid: capId })
    const oneDetail = (oneFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(oneDetail.count, 1, '应记录已录 1 项')
    assert.ok(oneDetail.score <= 13.4, '只录一项时最多 13.3 分，实际 ' + oneDetail.score)
    assert.ok(/已录 1\\/3 项/.test(oneDetail.note || ''), '应提示已录 1/3 项：' + oneDetail.note)
    assert.ok(/深蹲|硬拉/.test(oneDetail.note || ''), '应提示还差哪几项')

    // 再补深蹲：上限 40*2/3 = 26.7
    await act('saveStrength', STAFF, { openid: capId, lift: 'squat', weight: 150, reps: 1 })
    const twoFit = await act('memberFitness', COACH, { openid: capId })
    const twoDetail = (twoFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(twoDetail.count, 2)
    assert.ok(twoDetail.score <= 26.8, '录两项时最多 26.7 分，实际 ' + twoDetail.score)
    assert.ok(twoDetail.score > oneDetail.score, '补一项后分数应上升')

    // 补齐三项：不再封顶，按比例最多 40
    await act('saveStrength', STAFF, { openid: capId, lift: 'deadlift', weight: 180, reps: 1 })
    const fullFit = await act('memberFitness', COACH, { openid: capId })
    const fullDetail = (fullFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(fullDetail.count, 3)
    assert.ok(fullDetail.score > 26.8, '三项齐全后可以超过 26.7 分，实际 ' + fullDetail.score)
    assert.ok(!fullDetail.capped, '三项齐全时不应标记封顶')
    assert.strictEqual(fullDetail.note, '', '三项齐全时没有缺项说明')
    ok('相对力量：0 项记 0 分，1 项≤13.3，2 项≤26.7，3 项满分 40')
  }`

if (!t.includes(oldBlock)) {
  console.log('⚠ 未匹配旧测试块')
} else {
  t = t.replace(oldBlock, newBlock)
  console.log('✓ 已替换相对力量测试')
}

// 动态评分测试里「没力量成绩时不该有相对力量项」要改成「记 0 分」
const oldDyn = `  assert.ok(!(dyn0.latestBody.detail || []).some(d => d.key === 'strength'), '还没力量成绩时不该有相对力量项')`
const newDyn = `  const dynZero = (dyn0.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(dynZero, '没力量成绩时也应有相对力量项')
  assert.strictEqual(dynZero.score, 0, '没力量成绩时相对力量记 0 分')`
if (t.includes(oldDyn)) {
  t = t.replace(oldDyn, newDyn)
  console.log('✓ 动态评分用例已更新')
} else {
  console.log('  · 动态评分用例未匹配（可能已改）')
}

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
