// 测试：身体数据历史按测量日期排序；补录旧日期不会顶掉最新档案
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('评分是动态的：改成绩立刻生效，不读库里缓存')"

const extra = `  ok('评分是动态的：改成绩立刻生效，不读库里缓存')

  // 历史按测量日期排序；补录旧日期不能把「最新档案」改成旧的
  const ORD_ID = 'openid-order'
  await ensureMember(ORD_ID)
  await act('updateProfile', ORD_ID, { nickName: '排序测试', phone: '13800007700' })
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 70, height: 175, bodyFat: 18, date: '2026-05-10' })
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 75, height: 175, bodyFat: 20, date: '2026-06-10' })
  // 最后补录一条更早的记录
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 68, height: 175, bodyFat: 16, date: '2026-04-10' })

  const ordFit = await act('memberFitness', COACH, { openid: ORD_ID })
  const dates = (ordFit.bodyHistory || []).map(b => b.date)
  assert.deepStrictEqual(dates, ['2026-06-10', '2026-05-10', '2026-04-10'], '历史应按测量日期倒序，实际 ' + dates.join(','))
  assert.strictEqual(ordFit.latestBody.date, '2026-06-10', '最新档案应是测量日期最新的那条，实际 ' + ordFit.latestBody.date)
  assert.strictEqual(Number(ordFit.latestBody.weight), 75, '最新档案的体重也要对应最新日期')
  ok('身体数据历史按测量日期排序，补录旧日期不影响最新档案')`

if (t.includes('身体数据历史按测量日期排序')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入排序测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
