// 测试：评分是动态的（改成绩后立刻生效、不读库里缓存）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('相对力量三项缺项时最多 15 分')"

const extra = `  ok('相对力量三项缺项时最多 15 分')

  // 评分动态：成绩变化后不重新录体测，分数也要立刻变；库里的旧分数不参与展示
  const DYN_ID = 'openid-dynscore'
  await ensureMember(DYN_ID)
  await act('updateProfile', DYN_ID, { nickName: '动态评分', phone: '13800009900' })
  await act('saveBodyRecord', STAFF, { openid: DYN_ID, weight: 70, height: 175, bodyFat: 15 })
  const dyn0 = await act('memberFitness', COACH, { openid: DYN_ID })
  assert.ok(dyn0.latestBody, '应有最新身体数据')
  assert.ok(!(dyn0.latestBody.detail || []).some(d => d.key === 'strength'), '还没力量成绩时不该有相对力量项')

  // 只录一项：相对力量封顶 15
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'bench', weight: 100, reps: 1 })
  const dyn1 = await act('memberFitness', COACH, { openid: DYN_ID })
  const strength1 = (dyn1.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(strength1 && strength1.score <= 15, '只录一项时相对力量应 ≤ 15')

  // 补齐三项：分数立刻上升（没有重新录体测）
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'squat', weight: 140, reps: 1 })
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'deadlift', weight: 170, reps: 1 })
  const dyn2 = await act('memberFitness', COACH, { openid: DYN_ID })
  const strength2 = (dyn2.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(strength2.score > strength1.score, '补齐三项后相对力量应立刻提高，实际 ' + strength2.score + ' vs ' + strength1.score)
  assert.ok(dyn2.latestBody.score > dyn1.latestBody.score, '总分也应立刻提高')

  // 篡改库里的缓存分数，接口返回不应受影响
  await query(
    "update members set latest_body = jsonb_set(latest_body, '{score}', '999'::jsonb) where openid = $1",
    [DYN_ID]
  )
  await query("update body_records set score = 999 where openid = $1", [DYN_ID])
  const dyn3 = await act('memberFitness', COACH, { openid: DYN_ID })
  assert.notStrictEqual(dyn3.latestBody.score, 999, '不应该直接读库里缓存的分数')
  assert.strictEqual(dyn3.latestBody.score, dyn2.latestBody.score, '每次查看都按当前规则实时计算')
  const hist3 = (dyn3.bodyHistory || [])[0]
  assert.notStrictEqual(hist3.score, 999, '历史记录的分数也应实时算')
  ok('评分是动态的：改成绩立刻生效，不读库里缓存')`

if (t.includes('评分是动态的：改成绩立刻生效')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入动态评分测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
