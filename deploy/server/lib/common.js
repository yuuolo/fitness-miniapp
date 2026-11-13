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

function dayStart(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) fail('日期格式不正确')
  return Date.parse(dateStr + 'T00:00:00+08:00')
}

class BizError extends Error {}
function fail(msg) {
  throw new BizError(msg)
}

const ROLE_LEVEL = { member: 0, coach: 1, staff: 2, admin: 3 }
const ROLE_NAMES = { member: '会员', coach: '教练', staff: '前台', admin: '管理员' }

function need(me, role) {
  if (!me) fail('请先登录')
  if ((ROLE_LEVEL[me.role] || 0) < ROLE_LEVEL[role]) fail('没有权限')
}

function newId() {
  return crypto.randomBytes(16).toString('hex')
}

function memberLabel(m) {
  if (!m) return '未知会员'
  return m.nickName || (m.phone ? '会员' + String(m.phone).slice(-4) : '未命名会员')
}

function cardUsable(card, now) {
  if (!card || card.status !== 'active') return false
  if (card.expireAt && card.expireAt <= now) return false
  if (card.kind === 'period') return true
  return card.remainTimes > 0
}

// 入场优先用期限卡，其次次卡；私教课包不能入场
function pickEntryCard(cards, now) {
  const usable = cards.filter(c => cardUsable(c, now) && c.kind !== 'lesson')
  return usable.find(c => c.kind === 'period') || usable.find(c => c.kind === 'times') || null
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
    points: r.points || 0,
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

function cardTypeRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    name: r.name,
    kind: r.kind,
    times: r.times,
    days: r.days,
    price: r.price,
    desc: r.descr || '',
    onSale: !!r.on_sale,
    createdAt: r.created_at || 0
  }
}

function cardRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    openid: r.openid,
    typeId: r.type_id,
    name: r.name,
    kind: r.kind,
    remainTimes: r.remain_times,
    totalTimes: r.total_times,
    pending: r.pending,
    startAt: r.start_at,
    expireAt: r.expire_at,
    status: r.status,
    pausedAt: r.paused_at,
    expireRemindedAt: r.expire_reminded_at,
    operator: r.operator || '',
    createdAt: r.created_at
  }
}

function cardLogRow(r) {
  return {
    _id: r.id, cardId: r.card_id, openid: r.openid, change: r.change,
    reason: r.reason, operator: r.operator, createdAt: r.created_at
  }
}

function paymentRow(r) {
  return {
    _id: r.id, openid: r.openid, memberName: r.member_name, cardId: r.card_id,
    typeName: r.type_name, listPrice: r.list_price, amount: r.amount,
    payMethod: r.pay_method, payMethodName: r.pay_method_name, remark: r.remark,
    operator: r.operator, operatorName: r.operator_name, date: r.date, createdAt: r.created_at
  }
}

function scheduleRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    courseName: r.course_name,
    kind: r.kind,
    coachId: r.coach_id,
    coachName: r.coach_name,
    startAt: r.start_at,
    duration: r.duration,
    capacity: r.capacity,
    booked: r.booked,
    room: r.room || '',
    status: r.status,
    createdAt: r.created_at
  }
}

function bookingRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    type: r.type,
    openid: r.openid,
    memberName: r.member_name,
    memberPhone: r.member_phone,
    scheduleId: r.schedule_id,
    kind: r.kind,
    title: r.title,
    coachId: r.coach_id,
    coachName: r.coach_name,
    room: r.room,
    venueId: r.venue_id,
    slotId: r.slot_id,
    date: r.date,
    hour: r.hour,
    startAt: r.start_at,
    endAt: r.end_at,
    price: r.price,
    cardId: r.card_id,
    cardName: r.card_name,
    status: r.status,
    remindedAt: r.reminded_at,
    checkedAt: r.checked_at,
    operator: r.operator,
    cancelledAt: r.cancelled_at,
    cancelledBy: r.cancelled_by,
    usedAt: r.used_at,
    createdAt: r.created_at
  }
}

function venueRow(r) {
  if (!r) return null
  return {
    _id: r.id, name: r.name, desc: r.descr || '', openHour: r.open_hour,
    closeHour: r.close_hour, capacity: r.capacity, price: r.price,
    onSale: !!r.on_sale, createdAt: r.created_at
  }
}

function entryLogRow(r) {
  return {
    _id: r.id, openid: r.openid, date: r.date, result: r.result, reason: r.reason || '',
    cardId: r.card_id, cardName: r.card_name, operator: r.operator, createdAt: r.created_at
  }
}

function pointsLogRow(r) {
  return { _id: r.id, openid: r.openid, change: r.change, source: r.source, createdAt: r.created_at }
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

// executor 可以是 pool（{query}）或事务 client
async function addPoints(executor, openid, change, source) {
  await executor.query('update members set points = points + $2 where openid = $1', [openid, change])
  await executor.query(
    'insert into points_logs (id, openid, change, source, created_at) values ($1, $2, $3, $4, $5)',
    [newId(), openid, change, source, Date.now()]
  )
}

async function addCardLog(executor, card, change, reason, operator) {
  await executor.query(
    `insert into card_logs (id, card_id, openid, change, reason, operator, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [newId(), card._id, card.openid, change, reason, operator || '', Date.now()]
  )
}

const NO_SHOW_LIMIT = 3
const BLOCK_DAYS = 7

// 累计缺席满 3 次，暂停预约 7 天并清零
async function recordNoShow(executor, openid, now) {
  await executor.query(
    `update members set
       block_until = case when no_show + 1 >= $3 then $2 else block_until end,
       no_show     = case when no_show + 1 >= $3 then 0 else no_show + 1 end
     where openid = $1`,
    [openid, now + BLOCK_DAYS * DAY, NO_SHOW_LIMIT]
  )
}

// 私教课包占位释放：条件更新保证不会减成负数
async function releaseLessonPending(executor, cardId) {
  if (!cardId) return false
  const res = await executor.query(
    'update member_cards set pending = pending - 1 where id = $1 and pending > 0',
    [cardId]
  )
  return res.rowCount > 0
}

module.exports = {
  MIN, HOUR, DAY, TZ_OFFSET,
  cnDate, cnDateTime, cnHour, dayStart, BizError, fail, need,
  ROLE_LEVEL, ROLE_NAMES, newId, memberLabel, cardUsable, pickEntryCard,
  memberRow, cardTypeRow, cardRow, cardLogRow, paymentRow, scheduleRow, bookingRow,
  venueRow, entryLogRow, pointsLogRow, bodyRow, strengthRow, activityRow, momentRow,
  getMember, configGet, configSet,
  addPoints, addCardLog, recordNoShow, releaseLessonPending
}
