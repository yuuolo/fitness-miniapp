// 1) 身体数据历史按「测量日期」排序；最新档案也按测量时间取
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 历史列表：按测量时间倒序（原来按 created_at） ----------
const oldQ = `  const body = (await query(
    'select * from body_records where openid = $1 order by created_at desc limit 20', [openid]
  )).rows.map(bodyRow)`
const newQ = `  // 按「测量时间」倒序，补录旧日期时也能排到正确位置
  const body = (await query(
    'select * from body_records where openid = $1 order by measured_at desc, created_at desc limit 20', [openid]
  )).rows.map(bodyRow)`

if (!t.includes(oldQ)) {
  console.log('⚠ 未匹配历史查询')
} else {
  t = t.replace(oldQ, newQ)
  done.push('历史列表按测量时间排序')
}

// ---------- 2. 删除后重算最新档案：也按测量时间取 ----------
const oldDel = `  const left = (await query(
    \`select * from body_records where openid = $1
      order by date desc, created_at desc limit 1\`,
    [row.openid]
  )).rows`
const newDel = `  const left = (await query(
    \`select * from body_records where openid = $1
      order by measured_at desc, created_at desc limit 1\`,
    [row.openid]
  )).rows`

if (!t.includes(oldDel)) {
  console.log('⚠ 未匹配删除后的查询')
} else {
  t = t.replace(oldDel, newDel)
  done.push('删除后按测量时间取最新')
}

// ---------- 3. 保存体测：最新档案取「测量时间最新」的那条 ----------
// 原来无脑把刚保存的写进 latest_body，补录旧日期时会把「最新」改成旧的
const oldSave = `    // 会员档案上保留最新一份，首页/排行榜/好友列表直接读这里
    const latestBody = {
      date, measuredAt: now, weight, height, bmi, gender,
      segmentFat, segmentMuscle, bodyShape, bodyType, deviceName, reportImage,
      score: scored.score, detail: scored.detail, source: data.source || 'staff'
    }
    for (const f of BODY_NUM_FIELDS) {
      if (extra[f[1]] !== undefined) latestBody[f[0]] = extra[f[1]]
    }
    await client.query(
      'update members set gender = $2, height = $3, latest_body = $4 where openid = $1',
      [target._id, gender, height, JSON.stringify(latestBody)]
    )`

const newSave = `    // 会员档案上保留「测量时间最新」的一份（补录旧日期时不会把最新改成旧的）
    const newest = (await client.query(
      \`select * from body_records where openid = $1
        order by measured_at desc, created_at desc limit 1\`,
      [target._id]
    )).rows[0]

    let latestBody = null
    if (newest) {
      latestBody = bodyRow(newest)
      const latestScored = scoreBody({
        gender: gender || latestBody.gender,
        weight: latestBody.weight,
        height: height || latestBody.height,
        bodyFat: latestBody.bodyFat,
        sbdTotal: sbdOf(target.bestLift),
        sbdCount: sbdCountOf(target.bestLift)
      })
      latestBody.score = latestScored.score
      latestBody.detail = latestScored.detail
    }

    await client.query(
      'update members set gender = $2, height = $3, latest_body = $4 where openid = $1',
      [target._id, gender, height, latestBody ? JSON.stringify(latestBody) : null]
    )`

if (!t.includes(oldSave)) {
  console.log('⚠ 未匹配保存逻辑')
} else {
  t = t.replace(oldSave, newSave)
  done.push('最新档案按测量时间取')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
