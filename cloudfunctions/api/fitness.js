const {
  db, cnDate, fail, need, getDoc, memberLabel
} = require('./common')

// 可排行的力量动作
const LIFTS = {
  bench: '卧推',
  squat: '深蹲',
  deadlift: '硬拉',
  ohp: '站姿肩推',
  pullup: '引体向上'
}

const ACTIONS = {
  walk: '步行',
  run: '跑步',
  cycling: '骑行',
  swim: '游泳',
  strength: '力量训练',
  class: '团课',
  other: '其他'
}

function round(n, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(n * p) / p
}

function num(v, min, max, label) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) fail(label + '需在 ' + min + '–' + max + ' 之间')
  return round(n, 1)
}

function int(v, min, max, label) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(label + '需为 ' + min + '–' + max + ' 的整数')
  return n
}

// Epley 公式：由「重量 × 次数」估算单次最大重量
function oneRM(weight, reps) {
  if (reps <= 1) return weight
  return round(weight * (1 + reps / 30), 1)
}

function bmiOf(weight, height) {
  if (!weight || !height) return 0
  const m = height / 100
  return round(weight / (m * m), 1)
}

// 体脂率理想区间：男 15–20%、女 22–27%；未标性别按男性区间
function fatRange(gender) {
  return gender === 'female' ? { min: 22, max: 27 } : { min: 15, max: 20 }
}

// 身体评分 = 体脂率 40 + 相对力量 40 + 体重指数 20
// 缺项的维度不计入，最后按已有项归一到百分制
function scoreBody(input) {
  const { gender, weight, height, bodyFat, sbdTotal } = input
  const detail = []
  let got = 0
  let full = 0

  if (bodyFat > 0) {
    const r = fatRange(gender)
    let s
    if (bodyFat >= r.min && bodyFat <= r.max) s = 1
    else {
      const dist = bodyFat < r.min ? r.min - bodyFat : bodyFat - r.max
      s = Math.max(0, 1 - dist / 8)
    }
    detail.push({ key: 'fat', label: '体脂率', score: round(40 * s, 1), max: 40 })
    got += 40 * s
    full += 40
  }

  if (sbdTotal > 0 && weight > 0) {
    const ratio = sbdTotal / weight
    const target = gender === 'female' ? 2.2 : 3.0
    const s = Math.max(0, Math.min(1, ratio / target))
    detail.push({ key: 'strength', label: '相对力量', score: round(40 * s, 1), max: 40 })
    got += 40 * s
    full += 40
  }

  if (weight > 0 && height > 0) {
    const bmi = bmiOf(weight, height)
    let s
    if (bmi >= 18.5 && bmi <= 24) s = 1
    else s = Math.max(0, 1 - (bmi < 18.5 ? (18.5 - bmi) / 6 : (bmi - 24) / 10))
    detail.push({ key: 'bmi', label: '体重指数', score: round(20 * s, 1), max: 20 })
    got += 20 * s
    full += 20
  }

  if (!full) return { score: null, detail: [] }
  return { score: round((got / full) * 100, 0), detail }
}

function sbdOf(bestLift) {
  const b = bestLift || {}
  return round(['bench', 'squat', 'deadlift'].reduce((sum, k) => sum + ((b[k] && b[k].oneRM) || 0), 0), 1)
}

// 重新算分并写回会员的 latestBody（bestLift 变化时分数也要跟着变）
async function refreshScore(member, bestLift) {
  const latest = Object.assign({}, member.latestBody || {})
  if (!latest.weight) return latest
  const scored = scoreBody({
    gender: member.gender,
    weight: latest.weight,
    height: member.height || latest.height,
    bodyFat: latest.bodyFat,
    sbdTotal: sbdOf(bestLift)
  })
  latest.score = scored.score
  latest.detail = scored.detail
  return latest
}

// ---------- 身体数据 ----------

async function saveBodyRecord({ me, data }) {
  need(me, 'staff')
  const target = await getDoc('members', data.openid)
  if (!target) fail('会员不存在')
  const now = Date.now()

  const weight = num(data.weight, 20, 300, '体重(kg)')
  const height = data.height ? num(data.height, 80, 250, '身高(cm)') : (target.height || 0)
  if (!height) fail('请填写身高(cm)')
  const bodyFat = data.bodyFat ? num(data.bodyFat, 1, 70, '体脂率(%)') : 0
  const muscle = data.muscle ? num(data.muscle, 1, 150, '肌肉量(kg)') : 0
  const visceral = data.visceral ? num(data.visceral, 1, 30, '内脏脂肪等级') : 0
  const gender = data.gender === 'female' || data.gender === 'male' ? data.gender : (target.gender || '')
  const date = data.date || cnDate(now)
  const bmi = bmiOf(weight, height)
  const scored = scoreBody({ gender, weight, height, bodyFat, sbdTotal: sbdOf(target.bestLift) })

  await db.collection('body_records').add({
    data: {
      openid: target._id, date, weight, height, bodyFat, muscle, visceral, bmi,
      score: scored.score, detail: scored.detail,
      source: data.source || 'staff', operator: me._id, createdAt: now
    }
  })

  const latestBody = {
    weight, height, bodyFat, muscle, visceral, bmi,
    score: scored.score, detail: scored.detail, date, measuredAt: now
  }
  await db.collection('members').doc(target._id).update({
    data: { gender, height, latestBody }
  })

  return Object.assign({ memberName: memberLabel(target) }, latestBody)
}

// ---------- 力量成绩 ----------

async function saveStrength({ me, data }) {
  need(me, 'staff')
  const target = await getDoc('members', data.openid)
  if (!target) fail('会员不存在')
  if (!LIFTS[data.lift]) fail('未知动作')
  const lift = data.lift
  const weight = num(data.weight, 1, 500, '重量(kg)')
  const reps = int(data.reps, 1, 100, '次数')
  const now = Date.now()
  const date = data.date || cnDate(now)
  const rm = oneRM(weight, reps)

  await db.collection('strength_records').add({
    data: { openid: target._id, lift, weight, reps, oneRM: rm, date, operator: me._id, createdAt: now }
  })

  const bestLift = Object.assign({}, target.bestLift || {})
  let improved = false
  if (!bestLift[lift] || rm > bestLift[lift].oneRM) {
    bestLift[lift] = { oneRM: rm, weight, reps, date, at: now }
    improved = true
  }
  const sbdTotal = sbdOf(bestLift)
  const latestBody = await refreshScore(target, bestLift)
  await db.collection('members').doc(target._id).update({
    data: { bestLift, sbdTotal, latestBody }
  })

  return {
    memberName: memberLabel(target), lift, liftName: LIFTS[lift],
    weight, reps, oneRM: rm, improved, best: bestLift[lift],
    sbdTotal, bodyScore: latestBody.score === undefined ? null : latestBody.score
  }
}

// ---------- 运动数据 ----------

async function saveActivity({ me, data }) {
  need(me, 'staff')
  const target = await getDoc('members', data.openid)
  if (!target) fail('会员不存在')
  const now = Date.now()
  const date = data.date || cnDate(now)
  const doc = {
    openid: target._id,
    date,
    type: ACTIONS[data.type] ? data.type : 'other',
    steps: data.steps ? int(data.steps, 0, 200000, '步数') : 0,
    duration: data.duration ? int(data.duration, 1, 1440, '运动时长(分钟)') : 0,
    calories: data.calories ? int(data.calories, 0, 10000, '消耗(千卡)') : 0,
    avgHr: data.avgHr ? int(data.avgHr, 30, 250, '平均心率') : 0,
    source: data.source || 'staff',
    operator: me._id,
    createdAt: now
  }
  if (!doc.steps && !doc.duration && !doc.calories) fail('请至少填写步数、时长或消耗中的一项')

  // 同一个人同一天同来源只保留一条，设备重复同步不会堆积
  // 注意：doc(id).set 的 data 里不能再带 _id，否则云开发会报错
  const id = 'ar_' + target._id + '_' + date + '_' + doc.source
  await db.collection('activity_records').doc(id).set({ data: doc })
  return Object.assign({ _id: id, memberName: memberLabel(target), typeName: ACTIONS[doc.type] }, doc)
}

// ---------- 查询 ----------

async function fitnessOf(member, isSelf) {
  const openid = member._id
  const body = (await db.collection('body_records').where({ openid }).orderBy('createdAt', 'desc').limit(20).get()).data
  const strength = (await db.collection('strength_records').where({ openid }).orderBy('createdAt', 'desc').limit(30).get()).data
  const activity = (await db.collection('activity_records').where({ openid }).orderBy('date', 'desc').limit(14).get()).data

  const latest = member.latestBody || null
  // 别人没公开身体数据时，只能看到评分，看不到体重体脂
  const showBody = isSelf || !!member.isBodyPublic
  return {
    memberName: memberLabel(member),
    gender: member.gender || '',
    isBodyPublic: !!member.isBodyPublic,
    height: member.height || 0,
    latestBody: latest
      ? Object.assign({}, latest, showBody ? {} : { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })
      : null,
    bodyHistory: showBody ? body : body.map(b => Object.assign({}, b, { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })),
    bestLift: member.bestLift || {},
    sbdTotal: member.sbdTotal || 0,
    strengthHistory: strength,
    activity,
    lifts: Object.keys(LIFTS).map(k => ({ key: k, name: LIFTS[k] })),
    actionTypes: Object.keys(ACTIONS).map(k => ({ key: k, name: ACTIONS[k] }))
  }
}

async function myFitness({ me }) {
  need(me, 'member')
  return fitnessOf(await getDoc('members', me._id) || me, true)
}

async function memberFitness({ me, data }) {
  need(me, 'staff')
  const target = await getDoc('members', data.openid)
  if (!target) fail('会员不存在')
  return fitnessOf(target, false)
}

// ---------- 排行榜 ----------

// metric: absolute 比绝对重量；relative 比「1RM ÷ 体重」
// 相对体重榜只收自愿公开体重的会员，否则体重会被反推出来
async function leaderboard({ me, data }) {
  need(me, 'member')
  const lift = LIFTS[data.lift] ? data.lift : 'bench'
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const all = (await db.collection('members').limit(500).get()).data

  const rows = []
  for (const m of all) {
    const best = m.bestLift && m.bestLift[lift]
    if (!best || !best.oneRM) continue
    const weight = m.latestBody && m.latestBody.weight
    const isPublic = !!m.isBodyPublic
    const rel = weight > 0 ? round(best.oneRM / weight, 2) : null
    if (metric === 'relative' && (!isPublic || !rel)) continue
    rows.push({
      openid: m._id,
      name: memberLabel(m),
      oneRM: best.oneRM,
      weight: isPublic ? weight : null,
      relative: isPublic ? rel : null,
      bodyScore: isPublic && m.latestBody ? m.latestBody.score : null,
      isMe: m._id === me._id
    })
  }

  const key = metric === 'relative' ? 'relative' : 'oneRM'
  rows.sort((a, b) => b[key] - a[key])
  rows.forEach((r, i) => { r.rank = i + 1 })

  return {
    lift,
    liftName: LIFTS[lift],
    metric,
    total: rows.length,
    top: rows.slice(0, 20),
    me: rows.find(r => r.isMe) || null,
    lifts: Object.keys(LIFTS).map(k => ({ key: k, name: LIFTS[k] }))
  }
}

// ---------- 隐私开关 ----------

async function setBodyPublic({ me, data }) {
  need(me, 'member')
  const isPublic = !!data.isPublic
  await db.collection('members').doc(me._id).update({ data: { isBodyPublic: isPublic } })
  return { isBodyPublic: isPublic }
}

module.exports = {
  saveBodyRecord, saveStrength, saveActivity,
  myFitness, memberFitness, leaderboard, setBodyPublic,
  // 供内部/测试复用
  scoreBody, oneRM, bmiOf, LIFTS
}
