// 健身数据：身体记录、力量成绩、运动数据、排行榜、隐私开关
const { query, one, tx } = require('./db')
const {
  DAY, cnDate, dayStart, fail, need, newId, memberLabel, memberRow,
  bodyRow, strengthRow, activityRow, ROLE_LEVEL, ROLE_NAMES
} = require('./common')
const liftItems = require('./lift-items')
const bodyReport = require('./body-report')
const ocr = require('./ocr')
const { query: dbQuery } = require('./db')

// 可排行的力量动作改为从 lift_items 表读取（管理员可以增删），
// 这里保留一份默认值仅供内部/测试引用。
const LIFTS = {
  bench: '卧推',
  squat: '深蹲',
  deadlift: '硬拉',
  ohp: '站姿肩推',
  pullup: '引体向上'
}

// 运动字段定义：每种运动只收集自己需要的指标，避免骑行还要填步数这种错配
const ACTIVITY_FIELDS = {
  steps: { key: 'steps', label: '步数', unit: '步', min: 0, max: 200000, integer: true, placeholder: '例如 8000' },
  distance: { key: 'distance', label: '距离', unit: '公里', min: 0, max: 500, integer: false, placeholder: '例如 5.2' },
  duration: { key: 'duration', label: '时长', unit: '分钟', min: 1, max: 1440, integer: true, placeholder: '例如 45' },
  calories: { key: 'calories', label: '消耗', unit: '千卡', min: 0, max: 10000, integer: true, placeholder: '选填' },
  avgHr: { key: 'avgHr', label: '平均心率', unit: '次/分', min: 30, max: 250, integer: true, placeholder: '选填' }
}

// 每种运动填什么、必须填什么：
//   fields    —— 表单里出现的字段（顺序即展示顺序）
//   required  —— 至少要填一个；fill 为 true 时该项必填
const ACTIVITY_TYPES = [
  { key: 'walk', name: '步行', desc: '上下班走路、散步', fields: ['steps', 'distance', 'duration'], required: ['steps'] },
  { key: 'run', name: '跑步', desc: '跑步机或户外跑', fields: ['distance', 'duration', 'steps', 'calories', 'avgHr'], required: ['distance', 'duration'] },
  { key: 'cycling', name: '骑行', desc: '单车、动感单车', fields: ['distance', 'duration', 'calories', 'avgHr'], required: ['distance', 'duration'] },
  { key: 'swim', name: '游泳', desc: '泳池或公开水域', fields: ['distance', 'duration', 'calories', 'avgHr'], required: ['distance', 'duration'] },
  { key: 'strength', name: '力量训练', desc: '器械、自由重量训练', fields: ['duration', 'calories', 'avgHr'], required: ['duration'] },
  { key: 'class', name: '团课', desc: '操课、瑜伽、搏击等', fields: ['duration', 'calories', 'avgHr'], required: ['duration'] },
  { key: 'other', name: '其他', desc: '以上都不属于时选这个', fields: ['steps', 'distance', 'duration', 'calories'], required: ['steps', 'distance', 'duration', 'calories'] }
]

const ACTION_NAMES = ACTIVITY_TYPES.reduce((acc, a) => { acc[a.key] = a.name; return acc }, {})
const ACTION_BY_KEY = ACTIVITY_TYPES.reduce((acc, a) => { acc[a.key] = a; return acc }, {})

// 给小程序用的表单描述
function activityTypeMeta() {
  return ACTIVITY_TYPES.map(a => ({
    key: a.key,
    name: a.name,
    desc: a.desc,
    fields: a.fields.map(k => Object.assign({}, ACTIVITY_FIELDS[k], { required: a.required.length === 1 && a.required[0] === k })),
    required: a.required,
    // 只有一个必填项时才在表单上标「必填」
    strict: a.required.length === 1
  }))
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
// sbdCount：卧推/深蹲/硬拉里录了几项（0–3）
// 三项没录全时，相对力量最多只能拿 15 分（避免只录一项就顶到满分）
const STRENGTH_CAP_PARTIAL = 15

function scoreBody(input) {
  const { gender, weight, height, bodyFat, sbdTotal, sbdCount } = input
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
    const count = Number(sbdCount) || 0
    const missing = count < 3
    // 三项没录全时封顶 15 分
    const raw40 = 40 * s
    const capped = missing ? Math.min(raw40, STRENGTH_CAP_PARTIAL) : raw40
    detail.push({
      key: 'strength',
      label: '相对力量',
      score: round(capped, 1),
      max: 40,
      capped: missing && raw40 > STRENGTH_CAP_PARTIAL,
      note: missing ? '卧推/深蹲/硬拉未录全，本次最多 ' + STRENGTH_CAP_PARTIAL + ' 分' : ''
    })
    got += capped
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

// 卧推/深蹲/硬拉里录了几项（有 1RM 才计数）
function sbdCountOf(bestLift) {
  const b = bestLift || {}
  return ['bench', 'squat', 'deadlift'].filter(k => b[k] && b[k].oneRM > 0).length
}

function sbdOf(bestLift) {
  const b = bestLift || {}
  return round(['bench', 'squat', 'deadlift'].reduce((sum, k) => sum + ((b[k] && b[k].oneRM) || 0), 0), 1)
}

// 用「当前评分规则 + 当前最好成绩」实时给一条身体数据打分。
// 库里存的 score 只是缓存，展示时一律走这里，保证规则调整后立刻生效。
function withScore(member, body) {
  if (!body || !body.weight) return body
  const scored = scoreBody({
    gender: member.gender || body.gender,
    weight: body.weight,
    height: member.height || body.height,
    bodyFat: body.bodyFat,
    sbdTotal: sbdOf(member.bestLift),
    sbdCount: sbdCountOf(member.bestLift)
  })
  return Object.assign({}, body, { score: scored.score, detail: scored.detail })
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
    sbdTotal: sbdOf(bestLift),
    sbdCount: sbdCountOf(bestLift)
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
  need(me, 'coach')
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
    sbdTotal: sbdOf(target.bestLift),
    sbdCount: sbdCountOf(target.bestLift)
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

    // 会员档案上保留「测量时间最新」的一份（补录旧日期时不会把最新改成旧的）
    const newest = (await client.query(
      `select * from body_records where openid = $1
        order by date desc, created_at desc limit 1`,
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
    )
  })

  return Object.assign({ memberName: memberLabel(target) }, {
    date, measuredAt: now, weight, height, bmi, gender,
    segmentFat, segmentMuscle, bodyShape, bodyType, deviceName, reportImage,
    score: scored.score, detail: scored.detail, source: data.source || 'staff',
    ...Object.fromEntries(BODY_NUM_FIELDS.filter(f => extra[f[1]] !== undefined).map(f => [f[0], extra[f[1]]]))
  })
}

// 删除一条历史体测记录（教练/管理员，用于处理误传的资料）
// 删完要把会员档案上的「最新身体数据」重新算成剩下最新的一条
async function deleteBodyRecord({ me, data }) {
  need(me, 'coach')
  const id = String(data.id || '')
  if (!id) fail('缺少记录 id')

  const row = await one('select * from body_records where id = $1', [id])
  if (!row) fail('记录不存在')

  await query('delete from body_records where id = $1', [id])

  // 重新取这个会员剩下最新的一条
  const left = (await query(
    `select * from body_records where openid = $1
      order by date desc, created_at desc limit 1`,
    [row.openid]
  )).rows
  const remainRow = left[0] || null
  const member = memberRow((await query('select * from members where openid = $1', [row.openid])).rows[0])

  let latestBody = null
  if (remainRow && member) {
    latestBody = bodyRow(remainRow)
    const scored = scoreBody({
      gender: member.gender || latestBody.gender,
      weight: latestBody.weight,
      height: member.height || latestBody.height,
      bodyFat: latestBody.bodyFat,
      sbdTotal: sbdOf(member.bestLift),
      sbdCount: sbdCountOf(member.bestLift)
    })
    latestBody.score = scored.score
    latestBody.detail = scored.detail
  }

  await query('update members set latest_body = $2 where openid = $1', [
    row.openid,
    latestBody ? JSON.stringify(latestBody) : null
  ])

  const rest = (await query(
    'select count(*)::int as n from body_records where openid = $1', [row.openid]
  )).rows[0].n

  return {
    deleted: true,
    openid: row.openid,
    date: row.date,
    remaining: rest,
    latestBody,
    memberName: member ? memberLabel(member) : ''
  }
}

// 一段时间内的身体数据变化，供趋势图/变化对比用
async function bodyTrend({ me, data }) {
  need(me, 'member')
  const asStaff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.admin
  const openid = data.openid && asStaff ? data.openid : me._id
  const days = Math.min(Math.max(Number(data.days) || 30, 7), 365)
  const from = dayStart(cnDate(Date.now() - (days - 1) * DAY))

  const list = (await query(
    `select * from body_records where openid = $1 and measured_at >= $2
     order by measured_at asc limit 200`, [openid, from]
  )).rows.map(bodyRow)
  // 趋势里的评分也实时算（不读库里的旧分数）
  const trendMember = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  const scoredList = trendMember ? list.map(b => withScore(trendMember, b)) : list

  const metrics = ['weight', 'bodyFat', 'muscle', 'visceral', 'bmi', 'score']
  const first = scoredList[0]
  const last = scoredList[scoredList.length - 1]
  const delta = {}
  if (first && last && scoredList.length > 1) {
    metrics.forEach(k => {
      if (first[k] != null && last[k] != null) delta[k] = round(last[k] - first[k], 1)
    })
  }

  return {
    days,
    from: cnDate(from),
    count: scoredList.length,
    points: scoredList.map(r => {
      const p = { date: r.date, measuredAt: r.measuredAt }
      metrics.forEach(k => { p[k] = r[k] == null ? null : r[k] })
      return p
    }),
    delta
  }
}

// ---------- 力量成绩 ----------

async function saveStrength({ me, data }) {
  need(me, 'coach')
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

// 记录一次运动：只接受该类型支持的字段，并按类型做必填校验
async function saveActivity({ me, data }) {
  need(me, 'coach')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  const now = Date.now()
  const date = data.date || cnDate(now)

  const typeKey = ACTION_BY_KEY[data.type] ? data.type : 'other'
  const type = ACTION_BY_KEY[typeKey]
  const doc = { type: typeKey, steps: 0, distance: 0, duration: 0, calories: 0, avgHr: 0, source: data.source || 'staff' }

  // 只读取这种运动支持的字段，其他字段直接忽略（避免骑行被写进步数）
  for (const key of type.fields) {
    const meta = ACTIVITY_FIELDS[key]
    const raw = data[key]
    if (raw === undefined || raw === null || raw === '') continue
    if (key === 'distance') {
      doc.distance = num(raw, meta.min, meta.max, meta.label + '(公里)')
    } else {
      doc[key] = int(raw, meta.min, meta.max, meta.label + (meta.unit ? '(' + meta.unit + ')' : ''))
    }
  }

  // 必填校验：按类型的 required 列表，至少要有一项；单必填类型必须填那一项
  const filled = type.required.filter(k => Number(doc[k]) > 0)
  if (!filled.length) {
    if (type.required.length === 1) {
      fail(type.name + '需要填写' + ACTIVITY_FIELDS[type.required[0]].label)
    }
    fail(type.name + '至少要填写' + type.required.map(k => ACTIVITY_FIELDS[k].label).join('或') + '中的一项')
  }

  // 同一个人的「同一天 + 同类型 + 同来源」只保留一条：
  // 重复记录会覆盖（设备重复同步不会堆积），但一天里可以有多种不同运动
  const id = 'ar_' + target._id + '_' + date + '_' + typeKey + '_' + doc.source
  await query(
    `insert into activity_records (id, openid, date, type, steps, distance, duration, calories, avg_hr, source, operator, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (id) do update set
       type = excluded.type, steps = excluded.steps, distance = excluded.distance,
       duration = excluded.duration, calories = excluded.calories, avg_hr = excluded.avg_hr,
       operator = excluded.operator, created_at = excluded.created_at`,
    [id, target._id, date, doc.type, doc.steps, doc.distance, doc.duration, doc.calories,
      doc.avgHr, doc.source, me._id, now]
  )
  return Object.assign({ _id: id, memberName: memberLabel(target), typeName: ACTION_NAMES[doc.type] }, {
    openid: target._id, date, type: doc.type, steps: doc.steps, distance: doc.distance,
    duration: doc.duration, calories: doc.calories, avgHr: doc.avgHr,
    source: doc.source, operator: me._id, createdAt: now
  })
}

// ---------- 查询 ----------

async function fitnessOf(member, isSelf) {
  const openid = member._id
  const items = await liftItems.list()
  // 按「测量日期」倒序（补录旧日期时也能排到正确位置），同一天按保存时间
  const body = (await query(
    'select * from body_records where openid = $1 order by date desc, created_at desc limit 20', [openid]
  )).rows.map(bodyRow)
  const strength = (await query(
    'select * from strength_records where openid = $1 order by created_at desc limit 30', [openid]
  )).rows.map(strengthRow)
  const activity = (await query(
    'select * from activity_records where openid = $1 order by date desc limit 14', [openid]
  )).rows.map(activityRow)

  const latestSrc = member.latestBody || null
  // 别人没公开身体数据时，只能看到评分，看不到体重体脂
  const showBody = isSelf || !!member.isBodyPublic
  const hide = obj => Object.assign({}, obj, { weight: null, bodyFat: null, muscle: null, visceral: null, bmi: null })
  // 评分一律实时算（不读库里的旧分数）
  const latest = latestSrc ? withScore(member, latestSrc) : null
  const scoredHistory = body.map(b => withScore(member, b))
  return {
    openid: member._id,
    memberName: memberLabel(member),
    gender: member.gender || '',
    isBodyPublic: !!member.isBodyPublic,
    height: member.height || 0,
    latestBody: latest ? (showBody ? latest : hide(latest)) : null,
    bodyHistory: showBody ? scoredHistory : scoredHistory.map(hide),
    bestLift: member.bestLift || {},
    sbdTotal: member.sbdTotal || 0,
    strengthHistory: strength,
    activity,
    lifts: items.map(i => ({ key: i.key, name: i.name, unit: i.unit, metric: i.metric })),
    actionTypes: activityTypeMeta()
  }
}

async function myFitness({ me }) {
  need(me, 'member')
  const fresh = memberRow((await query('select * from members where openid = $1', [me._id])).rows[0]) || me
  return fitnessOf(fresh, true)
}

// 会员公开资料：任何人都能看，手机号只给自己 / 教练 / 管理员
async function memberProfile({ me, data }) {
  need(me, 'member')
  const m = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!m) fail('会员不存在')
  const myLevel = ROLE_LEVEL[me.role] || 0
  const canSeePhone = m._id === me._id || myLevel >= ROLE_LEVEL.coach
  return {
    _id: m._id,
    nickName: m.nickName || '',
    avatar: m.avatar || '',
    role: m.role,
    roleName: ROLE_NAMES[m.role] || '会员',
    gender: m.gender || '',
    height: m.height || 0,
    phone: canSeePhone ? (m.phone || '') : '',
    since: m.createdAt ? cnDate(m.createdAt) : '',
    isMe: m._id === me._id,
    bestLift: m.bestLift || {},
    sbdTotal: m.sbdTotal || 0
  }
}

// 任何会员都能看别人的身体数据（含历史）；前台不需要是教练
async function memberFitness({ me, data }) {
  need(me, 'member')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  // 第二个参数是「是否隐藏身体明细」，现在对所有人可见
  return fitnessOf(target, true)
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
// 找出「最近发生过变化」的项目：
// 取每条运动记录里「等于该会员该项目当前最好成绩」的那条（也就是造成当前名次的那次），
// 再看哪个项目最近的这种记录最新。
//   from 不为空时只看该周期内的记录；周期内没有就退回全部历史
async function lastChangedLift(keys, from) {
  const pick = async (since) => one(
    `with bests as (
       select openid, lift, max(one_rm)::numeric as best
         from strength_records
        where lift = any($1::text[])
        group by openid, lift
     ),
     latest as (
       select s.lift, max(s.created_at) as ts
         from strength_records s
         join bests b
           on b.openid = s.openid and b.lift = s.lift and s.one_rm = b.best
        where s.lift = any($1::text[]) and s.created_at >= $2
        group by s.lift
     )
     select lift, ts from latest order by ts desc limit 1`,
    [keys, since]
  )
  return (await pick(Number(from) || 0)) || (from ? await pick(0) : null)
}

async function leaderboard({ me, data }) {
  need(me, 'member')
  const items = await liftItems.list()
  if (!items.length) fail('还没有配置排行榜项目')

  const wanted = String(data.lift || '')
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())

  // 「综合评分榜」：按实时身体评分排名（体脂率 40 + 相对力量 40 + 体重指数 20）
  if (wanted === 'score') {
    const all = (await query('select * from members order by created_at')).rows.map(memberRow)
    const rows = []
    for (const m of all) {
      if (!m.latestBody || !m.latestBody.weight) continue
      const scored = withScore(m, m.latestBody)
      if (scored.score == null) continue
      const isPublic = !!m.isBodyPublic
      rows.push({
        openid: m._id,
        name: memberLabel(m),
        value: scored.score,
        oneRM: scored.score,
        weight: isPublic ? m.latestBody.weight : null,
        relative: null,
        bodyScore: scored.score,
        parts: (scored.detail || []).map(d => ({ key: d.key, label: d.label, score: d.score, max: d.max })),
        isMe: m._id === me._id
      })
    }
    rows.sort((a, b) => b.value - a.value)
    rows.forEach((r, i) => { r.rank = i + 1 })

    return {
      lift: 'score',
      liftName: '综合评分',
      autoPicked: false,
      recentAt: 0,
      unit: '分',
      liftMetric: 'score',
      metric,
      period: 'all',
      periodName: '总榜',
      periodFrom: 0,
      total: rows.length,
      top: rows.slice(0, 20),
      me: rows.find(r => r.isMe) || null,
      lifts: [{ key: 'score', name: '综合评分', unit: '分' }].concat(items.map(i => ({ key: i.key, name: i.name, unit: i.unit }))),
      periods: [{ key: 'week', name: '本周' }, { key: 'month', name: '本月' }, { key: 'all', name: '总榜' }]
    }
  }

  // 没指定项目时自动挑一个：
  // 优先「本周期内最近有成绩变化」的项目，本周期没人练就退回全部历史最近的
  let item = items.find(i => i.key === wanted) || null
  let autoPicked = false
  let recentAt = 0
  if (!item) {
    const recent = await lastChangedLift(items.map(i => i.key), range.from)
    if (recent) {
      item = items.find(i => i.key === recent.lift) || items[0]
      autoPicked = true
      recentAt = Number(recent.ts) || 0
    } else {
      item = items[0]
    }
  }

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
      bodyScore: isPublic && m.latestBody ? withScore(m, m.latestBody).score : null,
      isMe: m._id === me._id
    })
  }

  const sortKey = metric === 'relative' ? 'relative' : 'value'
  rows.sort((a, b) => b[sortKey] - a[sortKey])
  rows.forEach((r, i) => { r.rank = i + 1 })

  return {
    lift: item.key,
    liftName: item.name,
    autoPicked,
    recentAt,
    unit: item.unit,
    liftMetric: item.metric,
    metric,
    period,
    periodName: range.label,
    periodFrom: range.from,
    total: rows.length,
    top: rows.slice(0, 20),
    me: rows.find(r => r.isMe) || null,
    lifts: [{ key: 'score', name: '综合评分', unit: '分' }].concat(items.map(i => ({ key: i.key, name: i.name, unit: i.unit }))),
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
  const staff = (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.admin
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


// ---------- 体测报告识别 ----------

/**
 * 解析报告文字 → 体测字段（不落库，前端回填给教练核对后再保存）
 * 教练也能用：只是把图片上的数字转成字段，不涉及改别人资料。
 */
async function parseBodyReport({ me, data }) {
  need(me, 'coach')
  const text = String((data && data.text) || '')
  if (!text.trim()) fail('请把报告文字粘贴进来')
  if (text.length > 8000) fail('文字太长了，请只保留报告部分')
  const result = bodyReport.parse(text)
  const filled = result.filled || []
  if (!filled.length) fail('没认出任何体测指标，请确认粘贴的是体测报告文字')
  return {
    fields: result.fields,
    meta: result.meta,
    warnings: result.warnings,
    filled,
    textLength: text.length
  }
}

/** 读一张已上传图片的二进制：数据库存的直接查 media 表，云存储的回源下载 */
async function readUploadedImage(fileID) {
  const id = String(fileID || '').trim()
  if (!id) fail('缺少图片')

  const direct = (id.match(/\/api\/media\/([\w-]+)/) || [])[1]
  if (direct) {
    const row = (await dbQuery('select mime, bytes from media where id = $1', [direct])).rows[0]
    if (!row) fail('图片不存在或已过期，请重新上传')
    return { buffer: row.bytes, mime: row.mime || 'image/jpeg' }
  }

  if (!/^https:\/\//.test(id)) fail('图片地址不正确')
  const res = await fetch(id)
  if (!res.ok) fail('下载图片失败（HTTP ' + res.status + '）')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) fail('图片超过 12MB')
  return { buffer: buf, mime: res.headers.get('content-type') || 'image/jpeg' }
}

/** 识别报告图片：OCR 拿到文字后再解析成字段 */
async function ocrBodyReport({ me, data }) {
  need(me, 'coach')
  if (!ocr.isConfigured()) {
    fail(ocr.describe().hint)
  }
  const img = await readUploadedImage(data && data.fileID)

  let recognized = { text: '', items: [] }
  try {
    recognized = await ocr.recognize(img.buffer, img.mime)
  } catch (e) {
    fail(e.message)
  }
  const text = recognized.text || ''
  if (!text) fail('没识别出文字，换一张清晰点的图，或改用粘贴文字')

  // 带上坐标：报告的节段数据必须按空间位置配对，否则会串行
  const result = bodyReport.parse(text, recognized.items)
  if (!result.filled.length) {
    fail('识别到文字但没解析出体测指标，建议改用粘贴文字的方式')
  }
  return {
    fields: result.fields,
    meta: result.meta,
    warnings: result.warnings,
    filled: result.filled,
    rawText: text.slice(0, 2000),
    // 让前端知道这次是靠坐标解析的（节段更准）
    spatial: !!(recognized.items && recognized.items.length),
    boxes: (recognized.items || []).length
  }
}

// ---------- 隐私开关 ----------

async function setBodyPublic({ me, data }) {
  need(me, 'member')
  const isPublic = !!data.isPublic
  await query('update members set is_body_public = $2 where openid = $1', [me._id, isPublic])
  return { isBodyPublic: isPublic }
}

module.exports = {
  // 评分相关（重算脚本 / 测试会用到）
  scoreBody, sbdOf, sbdCountOf, fatRange, bmiOf,
  saveBodyRecord, deleteBodyRecord, saveStrength, saveActivity,
  myFitness, memberFitness, memberProfile, leaderboard, setBodyPublic, bodyTrend,
  listLiftItems, saveLiftItem, setLiftItemEnabled, deleteLiftItem,
  parseBodyReport, ocrBodyReport,
  // 供内部/测试复用
  scoreBody, oneRM, bmiOf, LIFTS
}
