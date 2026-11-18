// 补：综合评分榜通知（saveBodyRecord 返回前）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('rankScore')) {
  console.log('· 综合评分榜通知已存在')
  process.exit(0)
}

const from = `  return Object.assign({ memberName: memberLabel(target) }, {
    date, measuredAt: now, weight, height, bmi, gender,
    segmentFat, segmentMuscle, bodyShape, bodyType, deviceName, reportImage,
    score: scored.score, detail: scored.detail, source: data.source || 'staff',
    ...Object.fromEntries(BODY_NUM_FIELDS.filter(f => extra[f[1]] !== undefined).map(f => [f[0], extra[f[1]]]))
  })
}`

const to = `  const record = Object.assign({ memberName: memberLabel(target) }, {
    date, measuredAt: now, weight, height, bmi, gender,
    segmentFat, segmentMuscle, bodyShape, bodyType, deviceName, reportImage,
    score: scored.score, detail: scored.detail, source: data.source || 'staff',
    ...Object.fromEntries(BODY_NUM_FIELDS.filter(f => extra[f[1]] !== undefined).map(f => [f[0], extra[f[1]]]))
  })
  // 综合评分有变化 → 通知「综合评分榜」订阅者（本人不收）
  try {
    if (record.score !== undefined && record.score !== null) {
      notifyTopics.notifyRank(
        'rankScore',
        '综合评分榜',
        record.memberName + ' 更新评分 ' + record.score + ' 分',
        { exclude: target._id }
      ).catch(() => {})
    }
  } catch (e) {
    console.warn('notify rank score failed', e.message)
  }
  return record
}`

if (!t.includes(from)) {
  console.log('⚠ saveBodyRecord 返回块未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 综合评分榜通知已加')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
