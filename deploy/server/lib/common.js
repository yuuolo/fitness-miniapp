// 公共工具：时间、权限、校验、行 → 云开发同构对象映射
const crypto = require('crypto')
const { one } = require('./db')

const MIN = 60e3
const HOUR = 3600e3
const DAY = 864e5
const TZ_OFFSET = 8 * HOUR

// 业务时间一律按北京时间
function cnDate(ms) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10)
}

function cnDateTime(ms) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 16).replace('T', ' ')
}

function cnHour(ms) {
  return new Date(ms + TZ_OFFSET).getUTCHours()
}

// 微信订阅消息里 time 类型要求「2026年11月13日 09:00」这种格式，
// character_string 类型不能带中文，所以另给一个纯数字版本。
function wxTime(ms) {
  return new Date(ms + TZ_OFFSET).toISOString()
    .replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*$/, '$1年$2月$3日 $4:$5')
}

function wxDate(ms) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')
}

// character_string 只允许字母数字和符号，给一个短格式
function shortTime(ms) {
  return cnDateTime(ms)
}

function dayStart(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) fail('日期格式不正确')
  return Date.parse(dateStr + 'T00:00:00+08:00')
}

class BizError extends Error {}
function fail(msg) {
  throw new BizError(msg)
}

// 角色只有三级：会员 < 教练 < 管理员（原「前台」角色已移除）
const ROLE_LEVEL = { member: 0, coach: 1, admin: 2 }
const ROLE_NAMES = { member: '会员', coach: '教练', admin: '管理员' }

function need(me, role) {
  if (!me) fail('请先登录')
  // 防御：要求的角色若不存在，比较会变成 level < undefined（恒为 false）从而放行所有人
  if (!Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role)) {
    throw new Error('内部错误：未知角色 ' + role)
  }
  if ((ROLE_LEVEL[me.role] || 0) < ROLE_LEVEL[role]) fail('没有权限')
}

function newId() {
  return crypto.randomBytes(16).toString('hex')
}

function memberLabel(m) {
  if (!m) return '未知会员'
  return m.nickName || (m.phone ? '会员' + String(m.phone).slice(-4) : '未命名会员')
}


// ---------- 行映射：出参与云开发文档字段保持一致 ----------

function memberRow(r) {
  if (!r) return null
  return {
    _id: r.openid,
    openid: r.openid,
    nickName: r.nick_name || '',
    phone: r.phone || '',
    role: r.role || 'member',
    noShow: r.no_show || 0,
    blockUntil: r.block_until || 0,
    avatar: r.avatar || '',
    gender: r.gender || '',
    height: r.height || 0,
    isBodyPublic: !!r.is_body_public,
    bestLift: r.best_lift || {},
    sbdTotal: r.sbd_total || 0,
    latestBody: r.latest_body || null,
    createdAt: r.created_at || 0
  }
}










const BODY_COLUMNS = {
  body_fat: 'bodyFat',
  heart_rate: 'heartRate',
  muscle: 'muscle',
  muscle_rate: 'muscleRate',
  protein: 'protein',
  protein_rate: 'proteinRate',
  water: 'water',
  water_rate: 'waterRate',
  bone_mass: 'boneMass',
  bone_rate: 'boneRate',
  fat_mass: 'fatMass',
  skeletal_muscle: 'skeletalMuscle',
  visceral: 'visceral',
  waist_hip_ratio: 'waistHipRatio',
  body_age: 'bodyAge',
  skeletal_muscle_index: 'skeletalMuscleIndex',
  recommended_calories: 'recommendedCalories',
  bmr: 'bmr',
  fat_free_mass: 'fatFreeMass',
  device_score: 'deviceScore'
}

function bodyRow(r) {
  if (!r) return null
  const out = {
    _id: r.id,
    openid: r.openid,
    date: r.date,
    measuredAt: r.measured_at,
    weight: r.weight,
    height: r.height,
    bmi: r.bmi,
    gender: r.gender || '',
    segmentFat: r.segment_fat || {},
    segmentMuscle: r.segment_muscle || {},
    bodyShape: r.body_shape || '',
    bodyType: r.body_type || '',
    deviceName: r.device_name || '',
    reportImage: r.report_image || '',
    score: r.score,
    detail: r.detail || [],
    source: r.source,
    operator: r.operator,
    createdAt: r.created_at
  }
  for (const [col, key] of Object.entries(BODY_COLUMNS)) out[key] = r[col]
  return out
}

function strengthRow(r) {
  return {
    _id: r.id, openid: r.openid, lift: r.lift, weight: r.weight, reps: r.reps,
    oneRM: r.one_rm, date: r.date, operator: r.operator, createdAt: r.created_at
  }
}

function activityRow(r) {
  return {
    _id: r.id, openid: r.openid, date: r.date, type: r.type, steps: r.steps,
    duration: r.duration, calories: r.calories, avgHr: r.avg_hr,
    source: r.source, operator: r.operator, createdAt: r.created_at
  }
}

function momentRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    openid: r.openid,
    authorName: r.author_name,
    content: r.content || '',
    media: r.media || [],
    type: r.type,
    coachId: r.coach_id || '',
    coachName: r.coach_name || '',
    likedBy: r.liked_by || [],
    short: r.short || '',
    posterQr: r.poster_qr || '',
    status: r.status,
    date: r.date,
    createdAt: r.created_at
  }
}

// ---------- 常用写操作 ----------

async function getMember(openid) {
  return memberRow(await one('select * from members where openid = $1', [openid]))
}

async function configGet(key) {
  const row = await one('select value from config where key = $1', [key])
  return row ? row.value : null
}

async function configSet(key, value) {
  await one(
    `insert into config (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value returning key`,
    [key, JSON.stringify(value)]
  )
}

const NO_SHOW_LIMIT = 3
const BLOCK_DAYS = 7

module.exports = {
  MIN, HOUR, DAY, TZ_OFFSET,
  cnDate, cnDateTime, cnHour, wxTime, wxDate, shortTime, dayStart, BizError, fail, need,
  ROLE_LEVEL, ROLE_NAMES, newId, memberLabel, 
  memberRow,  bodyRow, strengthRow, activityRow, momentRow,
  getMember, configGet, configSet
}
