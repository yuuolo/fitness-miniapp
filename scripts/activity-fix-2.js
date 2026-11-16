// fitness.js：运动类型改成「每种类型有自己的字段」，并按类型校验
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const log = []

// ---------- 1. 替换 ACTIONS 为带字段定义的类型表 ----------
const oldActions = `const ACTIONS = {
  walk: '步行',
  run: '跑步',
  cycling: '骑行',
  swim: '游泳',
  strength: '力量训练',
  class: '团课',
  other: '其他'
}`

const newTypes = `// 运动字段定义：每种运动只收集自己需要的指标，避免骑行还要填步数这种错配
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
    fields: a.fields.map(k => Object.assign({}, ACTIVITY_FIELDS[k], { required: a.required.indexOf(k) >= 0 && (a.required.length === 1 || k === 'distance') })),
    required: a.required,
    // 只有一个必填项时才在表单上标「必填」
    strict: a.required.length === 1
  }))
}`

if (t.includes('const ACTIONS = {')) {
  t = t.replace(oldActions, newTypes)
  log.push('替换 ACTIONS 为按类型的字段定义')
} else if (!t.includes('const ACTIVITY_TYPES')) {
  throw new Error('找不到 ACTIONS 定义')
}

// ---------- 2. saveActivity 按类型校验 ----------
const oldSave = `async function saveActivity({ me, data }) {
  need(me, 'coach')
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
    \`insert into activity_records (id, openid, date, type, steps, duration, calories, avg_hr, source, operator, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (id) do update set
       type = excluded.type, steps = excluded.steps, duration = excluded.duration,
       calories = excluded.calories, avg_hr = excluded.avg_hr,
       operator = excluded.operator, created_at = excluded.created_at\`,
    [id, target._id, date, doc.type, doc.steps, doc.duration, doc.calories,
      doc.avgHr, doc.source, me._id, now]
  )
  return Object.assign({ _id: id, memberName: memberLabel(target), typeName: ACTIONS[doc.type] }, {
    openid: target._id, date, type: doc.type, steps: doc.steps, duration: doc.duration,
    calories: doc.calories, avgHr: doc.avgHr, source: doc.source, operator: me._id, createdAt: now
  })
}`

const newSave = `// 记录一次运动：只接受该类型支持的字段，并按类型做必填校验
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

  // 同一个人同一天同来源只保留一条，设备重复同步不会堆积
  const id = 'ar_' + target._id + '_' + date + '_' + doc.source
  await query(
    \`insert into activity_records (id, openid, date, type, steps, distance, duration, calories, avg_hr, source, operator, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (id) do update set
       type = excluded.type, steps = excluded.steps, distance = excluded.distance,
       duration = excluded.duration, calories = excluded.calories, avg_hr = excluded.avg_hr,
       operator = excluded.operator, created_at = excluded.created_at\`,
    [id, target._id, date, doc.type, doc.steps, doc.distance, doc.duration, doc.calories,
      doc.avgHr, doc.source, me._id, now]
  )
  return Object.assign({ _id: id, memberName: memberLabel(target), typeName: ACTION_NAMES[doc.type] }, {
    openid: target._id, date, type: doc.type, steps: doc.steps, distance: doc.distance,
    duration: doc.duration, calories: doc.calories, avgHr: doc.avgHr,
    source: doc.source, operator: me._id, createdAt: now
  })
}`

if (t.includes('async function saveActivity({ me, data }) {') && !t.includes('只接受该类型支持的字段')) {
  if (!t.includes(oldSave)) {
    // 打印实际内容便于定位
    const i = t.indexOf('async function saveActivity')
    console.log('⚠ saveActivity 原文不匹配，实际内容：')
    console.log(t.slice(i, i + 300))
  } else {
    t = t.replace(oldSave, newSave)
    log.push('saveActivity 改为按类型校验并存 distance')
  }
}

// ---------- 3. fitnessOf 返回新的 actionTypes ----------
t = t.replace(
  "actionTypes: Object.keys(ACTIONS).map(k => ({ key: k, name: ACTIONS[k] }))",
  "actionTypes: activityTypeMeta()"
)

// 剩余的 ACTIONS 引用替换成 ACTION_NAMES
t = t.replace(/\bACTIONS\[/g, 'ACTION_NAMES[')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(log.map(x => '  ✓ ' + x).join('\n') || '  （无改动）')

// 残留检查
const left = [...t.matchAll(/\bACTIONS\b/g)]
console.log('  剩余 ACTIONS 引用: ' + left.length + ' 处')

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
