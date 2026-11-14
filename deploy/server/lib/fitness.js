// 健身数据：身体记录、力量成绩、运动数据、排行榜、隐私开关
const { query, tx } = require('./db')
const {
  DAY, cnDate, dayStart, fail, need, newId, memberLabel, memberRow,
  bodyRow, strengthRow, activityRow, ROLE_LEVEL
} = require('./common')
const liftItems = require('./lift-items')

// 可排行的力量动作改为从 lift_items 表读取（管理员可以增删），
// 这里保留一份默认值仅供内部/测试引用。
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

function text(v, max, label) {
  const s = String(v === undefined || v === null ? '' : v).trim()
  if (s.length > max) fail(label + '不能超过 ' + max + ' 个字')
  return s
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

// 身体评分 = 体脂率 40 + 相对力量 40 + 体重指数 20，缺项按已有项归一到百分制
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

// 重新算分（bestLift 变化时分数也要跟着变）
function refreshScore(member, bestLift) {
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

// 体测设备报告上的指标：字段名、列名、最小值、最大值、中文名
const BODY_NUM_FIELDS = [
  ['bodyFat', 'body_fat', 1, 70, '体脂率(%)'],
  ['heartRate', 'heart_rate', 30, 220, '心率(次/分)'],
  ['muscle', 'muscle', 1, 150, '肌肉量(kg)'],
  ['muscleRate', 'muscle_rate', 1, 100, '肌肉率(%)'],
  ['protein', 'protein', 0.5, 50, '蛋白质量(kg)'],
  ['proteinRate', 'protein_rate', 1, 100, '蛋白质率(%)'],
  ['water', 'water', 1, 100, '体水分量(kg)'],
  ['waterRate', 'water_rate', 1, 100, '身体水分(%)'],
  ['boneMass', 'bone_mass', 0.2, 20, '骨盐量(kg)'],
  ['boneRate', 'bone_rate', 0.2, 20, '骨盐率(%)'],
  ['fatMass', 'fat_mass', 0.5, 150, '脂肪量(kg)'],
  ['skeletalMuscle', 'skeletal_muscle', 0.5, 100, '骨骼肌量(kg)'],
  ['visceral', 'visceral', 1, 30, '内脏脂肪等级'],
  ['waistHipRatio', 'waist_hip_ratio', 0.5, 2, '腰臀比'],
  ['bodyAge', 'body_age', 10, 100, '身体年龄'],
  ['skeletalMuscleIndex', 'skeletal_muscle_index', 1, 200, '骨骼肌指数'],
  ['recommendedCalories', 'recommended_calories', 500, 10000, '建议热量摄入(kcal)'],
  ['bmr', 'bmr', 500, 5000, '基础代谢率(kcal)'],
  ['fatFreeMass', 'fat_free_mass', 5, 200, '去脂体重(kg)'],
  ['deviceScore', 'device_score', 0, 100, '设备身体得分']
]

const SEGMENTS = ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg']
const SEGMENT_NAMES = {
  leftArm: '左上肢', rightArm: '右上肢', trunk: '躯干', leftLeg: '左下肢', rightLeg: '右下肢'
}

function readSegments(raw, label) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  SEGMENTS.forEach(k => {
    const v = raw[k]
    if (v === undefined || v === '' || v === null) return
    out[k] = num(v, 0, 100, label + SEGMENT_NAMES[k] + '(kg)')
  })
  return out
}

function isImageRef(s) {
  return /^(cloud:\/\/|https:\/\/)/.test(String(s || ''))
}

async function saveBodyRecord({ me, data }) {
  need(me, 'staff')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  const now = Date.now()

  const weight = num(data.weight, 20, 300, '体重(kg)')
  const height = data.height ? num(data.height, 80, 250, '身高(cm)') : (target.height || 0)
  if (!height) fail('请填写身高(cm)')
  const gender = data.gender === 'female' || data.gender === 'male' ? data.gender : (target.gender || '')
  const date = data.date || cnDate(now)
  const bmi = bmiOf(weight, height)

  const extra = {}
  BODY_NUM_FIELDS.forEach(f => {
    const v = data[f[0]]
    if (v === undefined || v === '' || v === null) return
    extra[f[1]] = num(v, f[2], f[3], f[4])
  })

  const segmentFat = readSegments(data.segmentFat, '节段脂肪·')
  const segmentMuscle = readSegments(data.segmentMuscle, '节段肌肉·')
  const bodyShape = text(data.bodyShape, 20, '身体形态')
  const bodyType = text(data.bodyType, 20, '身体类型')
  const deviceName = text(data.deviceName, 30, '设备名称')
  const reportImage = isImageRef(data.reportImage) ? String(data.reportImage) : ''

  const scored = scoreBody({
    gender,
    weight,
    height,
    bodyFat: extra.body_fat || 0,
    sbdTotal: sbdOf(target.bestLift)
  })

  const id = newId()
  const columns = [
    'id', 'openid', 'date', 'measured_at', 'weight', 'height', 'bmi', 'gender',
    'segment_fat', 'segment_muscle', 'body_shape', 'body_type', 'device_name',
    'report_image', 'score', 'detail', 'source', 'operator', 'created_at'
  ]
  const values = [
    id, target._id, date, now, weight, height, bmi, gender,
    JSON.stringify(segmentFat), JSON.stringify(segmentMuscle), bodyShape, bodyType,
    deviceName, reportImage, scored.score, JSON.stringify(scored.detail),
    data.source || 'staff', me._id, now
  ]
  for (const f of BODY_NUM_FIELDS) {
    if (extra[f[1]] === undefined) continue
    columns.push(f[1])
    values.push(extra[f[1]])
  }
  const placeholders = values.map((_, i) => '$' + (i + 1)).join(', ')

  await tx(async client => {
    await client.query(
      `insert into body_records (${columns.join(', ')}) values (${placeholders})`, values
    )

    // 会员档案上保留最新一份，首页/排行榜/好友列表直接读这里
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
    )
  })

  return Object.assign({ memberName: memberLabel(target) }, {
    date, measuredAt: now, weight, height, bmi, gender,
    segmentFat, segmentMuscle, bodyShape, bodyType, deviceName, reportImage,
    score: scored.score, detail: scored.detail, source: data.source || 'staff',
    ...Object.fromEntries(BODY_NUM_FIELDS.filter(f => extra[f[1]] !== undefined).map(f => [f[0], extra[f[1]]]))
  })
}

// 一段时间内的身体数据变化，供趋势图/变化对比用
async function bodyTrend({ me, data }) {
  need(me, 'member')
  const asStaff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.staff
  const openid = data.openid && asStaff ? data.openid : me._id
  const days = Math.min(Math.max(Number(data.days) || 30, 7), 365)
  const from = dayStart(cnDate(Date.now() - (days - 1) * DAY))

  const list = (await query(
    `select * from body_records where openid = $1 and measured_at >= $2
     order by measured_at asc limit 200`, [openid, from]
  )).rows.map(bodyRow)

  const metrics = ['weight', 'bodyFat', 'muscle', 'visceral', 'bmi', 'score']
  const first = list[0]
  const last = list[list.length - 1]
  const delta = {}
  if (first && last && list.length > 1) {
    metrics.forEach(k => {
      if (first[k] != null && last[k] != null) delta[k] = round(last[k] - first[k], 1)
    })
  }

  return {
    days,
    from: cnDate(from),
    count: list.length,
    points: list.map(r => {
      const p = { date: r.date, measuredAt: r.measuredAt }
      metrics.forEach(k => { p[k] = r[k] == null ? null : r[k] })
      return p
    }),
    delta
  }
}

// ---------- 力量成绩 ----------

async function saveStrength({ me, data }) {
  need(me, 'staff')
  const items = await liftItems.enabledMap()
  const item = items[data.lift] || (data.lift ? null : items.bench) || Object.values(items)[0]
  if (!item) fail('未知动作')
  if (data.lift && !items[data.lift]) fail('这个项目已下架，请刷新后重试')
  const lift = item.key
  const weight = num(data.weight, 0, 500, '重量(kg)')
  const reps = int(data.reps, 1, 200, '次数')
  if (item.metric !== 'reps' && weight <= 0) fail('请填写重量')
  const now = Date.now()
  const date = data.date || cnDate(now)
  // one_rm 列存的是「按该项目算法算出的成绩」，排行榜直接按它排名
  const score = liftItems.computeValue(item.metric, weight, reps)

  return tx(async client => {
    const target = memberRow((await client.query(
      'select * from members where openid = $1 for update', [data.openid]
    )).rows[0])
    if (!target) fail('会员不存在')

    await client.query(
      `insert into strength_records (id, openid, lift, weight, reps, one_rm, date, operator, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [newId(), target._id, lift, weight, reps, score, date, me._id, now]
    )

    const bestLift = Object.assign({}, target.bestLift || {})
    let improved = false
    if (!bestLift[lift] || score > bestLift[lift].oneRM) {
      bestLift[lift] = { oneRM: score, weight, reps, date, at: now }
      improved = true
    }
    const sbdTotal = sbdOf(bestLift)
    const latestBody = refreshScore(target, bestLift)
    await client.query(
      'update members set best_lift = $2, sbd_total = $3, latest_body = $4 where openid = $1',
      [target._id, JSON.stringify(bestLift), sbdTotal, JSON.stringify(latestBody)]
    )

    return {
      memberName: memberLabel(target),
      lift,
      liftName: item.name,
      unit: item.unit,
      liftMetric: item.metric,
      weight,
      reps,
      oneRM: score,
      value: score,
      improved,
      best: bestLift[lift],
      sbdTotal,
      bodyScore: latestBody.score === undefined ? null : latestBody.score
    }
  })
}

// ---------- 运动数据 ----------

async function saveActivity({ me, data }) {
  need(me, 'staff')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  const now = Date.now()
  const date = data.date || cnDate(now)
  const doc = {
    type: ACTIONS[data.type] ? data.type : 'other',
    steps: data.steps ? int(data.steps, 0, 200000, '步数') : 0,
    duration: data.duration ? int(data.duration, 1, 1440, '运动时长(分钟)') : 0,
    calories: data.calories ? int(data.calories, 0, 10000, '消耗(千卡)') : 0,
    avgHr: data.avgHr ? int(data.avgHr, 30, 250, '平均心率') : 0,
    source: data.source || 'staff'
  }
  if (!doc.steps && !doc.duration && !doc.calories) fail('请至少填写步数、时长或消耗中的一项')

  // 同一个人同一天同来源只保留一条，设备重复同步不会堆积
  const id = 'ar_' + target._id + '_' + date + '_' + doc.source
  await query(
    `insert into activity_records (id, openid, date, type, steps, duration, calories, avg_hr, source, operator, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (id) do update set
       type = excluded.type, steps = excluded.steps, duration = excluded.duration,
       calories = excluded.calories, avg_hr = excluded.avg_hr,
       operator = excluded.operator, created_at = excluded.created_at`,
    [id, target._id, date, doc.type, doc.steps, doc.duration, doc.calories,
      doc.avgHr, doc.source, me._id, now]
  )
  return Object.assign({ _id: id, memberName: memberLabel(target), typeName: ACTIONS[doc.type] }, {
    openid: target._id, date, type: doc.type, steps: doc.steps, duration: doc.duration,
    calories: doc.calories, avgHr: doc.avgHr, source: doc.source, operator: me._id, createdAt: now
  })
}

// ---------- 查询 ----------

async function fitnessOf(member, isSelf) {
  const openid = member._id
  const items = await liftItems.list()
  const body = (await query(
    'select * from body_records where openid = $1 order by created_at desc limit 20', [openid]
  )).rows.map(bodyRow)
  const strength = (await query(
    'select * from strength_records where openid = $1 order by created_at desc limit 30', [openid]
  )).rows.map(strengthRow)
  const activity = (await query(
    'select * from activity_records where openid = $1 order by date desc limit 14', [openid]
  )).rows.map(activityRow)

  const latest = member.latestBody || null
  // 别人没公开身体数据时，只能看到评分，看不到体重体脂
  const showBody = isSelf || !!member.isBodyPublic
  const hide = obj => Object.assign({}, obj, { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })
  return {
    memberName: memberLabel(member),
    gender: member.gender || '',
    isBodyPublic: !!member.isBodyPublic,
    height: member.height || 0,
    latestBody: latest ? (showBody ? Object.assign({}, latest) : hide(latest)) : null,
    bodyHistory: showBody ? body : body.map(hide),
    bestLift: member.bestLift || {},
    sbdTotal: member.sbdTotal || 0,
    strengthHistory: strength,
    activity,
    lifts: items.map(i => ({ key: i.key, name: i.name, unit: i.unit, metric: i.metric })),
    actionTypes: Object.keys(ACTIONS).map(k => ({ key: k, name: ACTIONS[k] }))
  }
}

async function myFitness({ me }) {
  need(me, 'member')
  const fresh = memberRow((await query('select * from members where openid = $1', [me._id])).rows[0]) || me
  return fitnessOf(fresh, true)
}

async function memberFitness({ me, data }) {
  need(me, 'staff')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  return fitnessOf(target, false)
}

// ---------- 排行榜 ----------

// 周期：all 总榜 / week 本周（周一起）/ month 本月，均按北京时间切分
function periodRange(period, now) {
  const todayStart = dayStart(cnDate(now))
  if (period === 'week') {
    // 用北京时间判断星期几，周一作为一周起点
    const dow = new Date(todayStart + 8 * 3600e3).getUTCDay() // 0 = 周日
    const offset = (dow + 6) % 7
    return { from: todayStart - offset * DAY, label: '本周' }
  }
  if (period === 'month') {
    const d = new Date(todayStart + 8 * 3600e3)
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 8 * 3600e3
    return { from, label: '本月' }
  }
  return { from: 0, label: '总榜' }
}

// metric: absolute 比绝对成绩；relative 比「成绩 ÷ 体重」
// 相对体重榜只收自愿公开体重的会员，否则体重会被反推出来
async function leaderboard({ me, data }) {
  need(me, 'member')
  const items = await liftItems.list()
  if (!items.length) fail('还没有配置排行榜项目')

  const wanted = String(data.lift || '')
  const item = items.find(i => i.key === wanted) || items[0]
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())

  // 每个会员在周期内取最好的一条成绩（one_rm 存的就是该项目算出的数值）
  const best = (await query(
    `select openid, max(one_rm)::numeric as best
       from strength_records
      where lift = $1 and created_at >= $2
      group by openid
      order by best desc
      limit 500`,
    [item.key, range.from]
  )).rows

  const openids = best.map(r => r.openid)
  const members = openids.length
    ? (await query('select * from members where openid = any($1::text[])', [openids])).rows.map(memberRow)
    : []
  const byId = {}
  members.forEach(m => { byId[m._id] = m })

  const rows = []
  for (const r of best) {
    const m = byId[r.openid]
    if (!m) continue
    const value = Number(r.best) || 0
    if (!value) continue
    const weight = m.latestBody && m.latestBody.weight
    const isPublic = !!m.isBodyPublic
    const rel = weight > 0 ? round(value / weight, 2) : null
    if (metric === 'relative' && (!isPublic || !rel)) continue
    rows.push({
      openid: m._id,
      name: memberLabel(m),
      oneRM: value,               // 兼容旧字段名，实际是该项目算出的数值
      value,
      weight: isPublic ? weight : null,
      relative: isPublic ? rel : null,
      bodyScore: isPublic && m.latestBody ? m.latestBody.score : null,
      isMe: m._id === me._id
    })
  }

  const sortKey = metric === 'relative' ? 'relative' : 'value'
  rows.sort((a, b) => b[sortKey] - a[sortKey])
  rows.forEach((r, i) => { r.rank = i + 1 })

  return {
    lift: item.key,
    liftName: item.name,
    unit: item.unit,
    liftMetric: item.metric,
    metric,
    period,
    periodName: range.label,
    periodFrom: range.from,
    total: rows.length,
    top: rows.slice(0, 20),
    me: rows.find(r => r.isMe) || null,
    lifts: items.map(i => ({ key: i.key, name: i.name, unit: i.unit })),
    periods: [
      { key: 'week', name: '本周' },
      { key: 'month', name: '本月' },
      { key: 'all', name: '总榜' }
    ]
  }
}

// ---------- 排行榜项目（管理员可增删） ----------

async function listLiftItems({ me, data }) {
  need(me, 'member')
  const staff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.staff
  const items = await liftItems.list({ includeDisabled: staff && !!data.includeDisabled })
  return {
    items,
    metrics: Object.entries(liftItems.METRICS).map(([key, v]) => ({ key, name: v.name, unit: v.unit })),
    canManage: me.role === 'admin'
  }
}

async function saveLiftItem({ me, data }) {
  return liftItems.save({ me, data })
}

async function setLiftItemEnabled({ me, data }) {
  return liftItems.setEnabled({ me, data })
}

async function deleteLiftItem({ me, data }) {
  return liftItems.remove({ me, data })
}

// ---------- 隐私开关 ----------

async function setBodyPublic({ me, data }) {
  need(me, 'member')
  const isPublic = !!data.isPublic
  await query('update members set is_body_public = $2 where openid = $1', [me._id, isPublic])
  return { isBodyPublic: isPublic }
}

module.exports = {
  saveBodyRecord, saveStrength, saveActivity,
  myFitness, memberFitness, leaderboard, setBodyPublic, bodyTrend,
  listLiftItems, saveLiftItem, setLiftItemEnabled, deleteLiftItem,
  // 供内部/测试复用
  scoreBody, oneRM, bmiOf, LIFTS
}
