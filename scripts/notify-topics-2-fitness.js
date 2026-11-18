// 排行榜通知 hook：力量榜（已加）+ 综合评分榜（saveBodyRecord 返回前）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('综合评分榜') && t.includes('notifyRank')) {
  console.log('· 已加过通知 hook')
  process.exit(0)
}

if (!t.includes("const notifyTopics = require('./notify-topics')")) {
  t = t.replace(
    "const liftItems = require('./lift-items')",
    "const liftItems = require('./lift-items')\nconst notifyTopics = require('./notify-topics')"
  )
}

// 1. 力量榜：saveStrength 里刷新最好成绩时通知
if (!t.includes('rankLift')) {
  const from = `    return {
      memberName: memberLabel(target),
      lift,
      liftName: item.name,
      unit: item.unit,
      liftMetric: item.metric,
      weight,
      reps,
      oneRM: score,
      value: score,
      videoUrl,
      videoThumb,
      improved,
      best: bestLift[lift],
      sbdTotal,
      bodyScore: latestBody.score === undefined ? null : latestBody.score
    }
  })`
  const to = `    const result = {
      memberName: memberLabel(target),
      lift,
      liftName: item.name,
      unit: item.unit,
      liftMetric: item.metric,
      weight,
      reps,
      oneRM: score,
      value: score,
      videoUrl,
      videoThumb,
      improved,
      best: bestLift[lift],
      sbdTotal,
      bodyScore: latestBody.score === undefined ? null : latestBody.score
    }
    // 刷新了该项目最好成绩 → 通知「力量排行榜」订阅者（本人不收）
    try {
      if (improved) {
        notifyTopics.notifyRank(
          'rankLift',
          item.name + '排行榜',
          result.memberName + ' 刷到 ' + score + (item.unit || ''),
          { exclude: target._id }
        ).catch(() => {})
      }
    } catch (e) {
      console.warn('notify rank lift failed', e.message)
    }
    return result
  })`
  if (!t.includes(from)) {
    console.log('⚠ saveStrength 返回块未匹配')
    process.exit(1)
  }
  t = t.replace(from, to)
  console.log('✓ 力量排行榜通知已加')
}

// 2. 综合评分榜：saveBodyRecord 返回前通知（评分有变化才发）
if (!t.includes('rankScore')) {
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
  console.log('✓ 综合评分榜通知已加')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
