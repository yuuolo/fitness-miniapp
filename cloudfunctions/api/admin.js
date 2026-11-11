const {
  db, _, MIN, DAY, cnDate, dayStart, fail, need, getDoc, txGet, cardUsable,
  memberLabel, addPoints, addCardLog, recordNoShow, releaseLessonPending, ROLE_LEVEL
} = require('./common')

const PAY_METHODS = { cash: '现金', wechat_qr: '微信收款码', alipay_qr: '支付宝收款码', pos: 'POS 刷卡', free: '赠送' }
const CARD_KINDS = ['period', 'times', 'lesson']
const ATTEND_POINTS = 5

function int(v, min, max, label) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(label + '需为 ' + min + '–' + max + ' 的整数')
  return n
}

function text(v, min, max, label) {
  const s = String(v === undefined || v === null ? '' : v).trim()
  if (s.length < min || s.length > max) fail(label + (min ? '需为 ' + min + '–' + max + ' 个字' : '不能超过 ' + max + ' 个字'))
  return s
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function dashboard({ me }) {
  need(me, 'coach')
  const now = Date.now()
  const today = cnDate(now)
  const from = dayStart(today)
  const classWhere = { type: 'class', startAt: _.gte(from).and(_.lt(from + DAY)), status: _.neq('cancelled') }
  if (me.role === 'coach') classWhere.coachId = me._id
  const result = {
    role: me.role,
    today,
    classBookings: (await db.collection('bookings').where(classWhere).count()).total
  }
  if (ROLE_LEVEL[me.role] >= ROLE_LEVEL.staff) {
    result.entries = (await db.collection('entry_logs').where({ date: today, result: 'ok' }).count()).total
    result.venueBookings = (await db.collection('bookings').where({ type: 'venue', date: today, status: _.neq('cancelled') }).count()).total
    result.members = (await db.collection('members').count()).total
  }
  return result
}

// ---------- 会员 ----------

async function searchMembers({ me, data }) {
  need(me, 'staff')
  const kw = String(data.keyword || '').trim()
  let query = db.collection('members')
  if (kw) {
    const re = db.RegExp({ regexp: escapeRegExp(kw), options: 'i' })
    query = query.where(/^\d+$/.test(kw) ? { phone: re } : { nickName: re })
  }
  return (await query.orderBy('createdAt', 'desc').limit(50).get()).data
}

async function memberDetail({ me, data }) {
  need(me, 'staff')
  const member = await getDoc('members', data.openid)
  if (!member) fail('会员不存在')
  const now = Date.now()
  const cards = (await db.collection('member_cards').where({ openid: member._id }).orderBy('createdAt', 'desc').limit(50).get()).data
  const bookings = (await db.collection('bookings').where({ openid: member._id }).orderBy('startAt', 'desc').limit(20).get()).data
  const entries = (await db.collection('entry_logs').where({ openid: member._id }).orderBy('createdAt', 'desc').limit(10).get()).data
  return {
    member,
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    bookings,
    entries
  }
}

async function openCard({ me, data }) {
  need(me, 'staff')
  const member = await getDoc('members', data.openid)
  if (!member) fail('会员不存在')
  const type = await getDoc('card_types', data.typeId)
  if (!type) fail('卡种不存在')
  const amount = int(data.amount, 0, 10000000, '实收金额（分）')
  if (!PAY_METHODS[data.payMethod]) fail('请选择收款方式')
  const remark = text(data.remark, 0, 100, '备注')
  const now = Date.now()
  const times = type.kind === 'period' ? 0 : type.times
  const card = {
    openid: member._id, typeId: type._id, name: type.name, kind: type.kind,
    remainTimes: times, totalTimes: times, pending: 0, startAt: now, expireAt: now + type.days * DAY,
    status: 'active', pausedAt: 0, expireRemindedAt: 0, operator: me._id, createdAt: now
  }
  const res = await db.collection('member_cards').add({ data: card })
  card._id = res._id
  await addCardLog(card, times, '开卡', me._id)
  await db.collection('offline_payments').add({
    data: {
      openid: member._id, memberName: memberLabel(member), cardId: card._id, typeName: type.name,
      listPrice: type.price, amount, payMethod: data.payMethod, payMethodName: PAY_METHODS[data.payMethod],
      remark, operator: me._id, operatorName: memberLabel(me), date: cnDate(now), createdAt: now
    }
  })
  return card
}

async function adjustCard({ me, data }) {
  need(me, 'staff')
  const card = await getDoc('member_cards', data.cardId)
  if (!card) fail('会员卡不存在')
  const remark = text(data.remark, 1, 100, '调整原因')
  const delta = int(data.delta || 0, -1000, 1000, '次数调整')
  const extendDays = int(data.extendDays || 0, -3650, 3650, '延期天数')
  if (!delta && !extendDays) fail('请填写调整次数或延期天数')
  if (delta && card.kind === 'period') fail('期限卡没有次数')
  const patch = {}
  if (delta) patch.remainTimes = _.inc(delta)
  if (extendDays) {
    // 缩短有效期时不能缩到开卡时间之前
    if (extendDays < 0 && card.expireAt + extendDays * DAY < card.startAt) {
      fail('有效期不能早于开卡时间')
    }
    patch.expireAt = _.inc(extendDays * DAY)
    patch.expireRemindedAt = 0
  }
  const where = { _id: card._id }
  if (delta < 0) where.remainTimes = _.gte(-delta)
  const res = await db.collection('member_cards').where(where).update({ data: patch })
  if (!res.stats || res.stats.updated !== 1) fail('剩余次数不足')
  const note = extendDays ? '（有效期 ' + (extendDays > 0 ? '+' : '') + extendDays + ' 天）' : ''
  await addCardLog(card, delta, remark + note, me._id)
  return getDoc('member_cards', card._id)
}

async function setCardStatus({ me, data }) {
  need(me, 'staff')
  const card = await getDoc('member_cards', data.cardId)
  if (!card) fail('会员卡不存在')
  const now = Date.now()
  let patch
  if (data.status === 'paused') {
    if (card.status !== 'active') fail('只有正常状态的卡可以停卡')
    patch = { status: 'paused', pausedAt: now }
  } else if (data.status === 'active') {
    if (card.status !== 'paused') fail('这张卡没有停卡')
    // 停卡期间不计有效期：恢复时把停掉的时长补回去
    patch = { status: 'active', pausedAt: 0, expireAt: card.expireAt + (now - card.pausedAt), expireRemindedAt: 0 }
  } else if (data.status === 'void') {
    if (card.status === 'void') fail('这张卡已作废')
    patch = { status: 'void' }
  } else {
    fail('未知状态')
  }
  await db.collection('member_cards').doc(card._id).update({ data: patch })
  const names = { paused: '停卡', active: '恢复', void: '作废' }
  await addCardLog(card, 0, names[data.status], me._id)
  return Object.assign(card, patch)
}

async function setRole({ me, data }) {
  need(me, 'admin')
  if (!Object.prototype.hasOwnProperty.call(ROLE_LEVEL, data.role)) fail('未知角色')
  if (data.openid === me._id) fail('不能修改自己的角色')
  const member = await getDoc('members', data.openid)
  if (!member) fail('会员不存在')
  await db.collection('members').doc(member._id).update({ data: { role: data.role } })
  return { role: data.role }
}

// ---------- 卡种 ----------

async function listCardTypes({ me }) {
  need(me, 'staff')
  return (await db.collection('card_types').orderBy('createdAt', 'asc').get()).data
}

async function saveCardType({ me, data }) {
  need(me, 'admin')
  if (!CARD_KINDS.includes(data.kind)) fail('请选择卡类型')
  const doc = {
    name: text(data.name, 1, 20, '卡名称'),
    kind: data.kind,
    times: data.kind === 'period' ? 0 : int(data.times, 1, 1000, '次数'),
    days: int(data.days, 1, 3650, '有效天数'),
    price: int(data.price, 0, 10000000, '价格（分）'),
    desc: text(data.desc, 0, 100, '说明'),
    onSale: data.onSale !== false
  }
  if (data._id) {
    if (!(await getDoc('card_types', data._id))) fail('卡种不存在')
    await db.collection('card_types').doc(data._id).update({ data: doc })
    return Object.assign({ _id: data._id }, doc)
  }
  doc.createdAt = Date.now()
  const res = await db.collection('card_types').add({ data: doc })
  return Object.assign({ _id: res._id }, doc)
}

// ---------- 课程 ----------

async function listCoaches({ me }) {
  need(me, 'staff')
  const list = (await db.collection('members').where({ role: _.in(['coach', 'staff', 'admin']) }).limit(100).get()).data
  return list.map(m => ({ _id: m._id, name: memberLabel(m), role: m.role }))
}

async function staffSchedules({ me, data }) {
  need(me, 'coach')
  const from = dayStart(data.date)
  const where = { startAt: _.gte(from).and(_.lt(from + DAY)) }
  if (me.role === 'coach') where.coachId = me._id
  return (await db.collection('schedules').where(where).orderBy('startAt', 'asc').limit(100).get()).data
}

async function saveSchedule({ me, data }) {
  need(me, 'staff')
  const now = Date.now()
  const kind = data.kind === 'private' ? 'private' : 'group'
  const coach = await getDoc('members', data.coachId)
  if (!coach || ROLE_LEVEL[coach.role] < ROLE_LEVEL.coach) fail('请选择教练')
  const startAt = Number(data.startAt)
  if (!Number.isFinite(startAt) || startAt <= now) fail('上课时间必须晚于现在')
  const doc = {
    courseName: text(data.courseName, 1, 20, '课程名称'),
    kind,
    coachId: coach._id,
    coachName: memberLabel(coach),
    startAt,
    duration: int(data.duration, 15, 240, '时长（分钟）'),
    capacity: kind === 'private' ? 1 : int(data.capacity, 1, 200, '人数上限'),
    room: text(data.room, 0, 20, '教室')
  }
  if (data._id) {
    const old = await getDoc('schedules', data._id)
    if (!old || old.status !== 'active') fail('课程不存在或已取消')
    if (old.booked > 0 && (old.startAt !== doc.startAt || old.kind !== doc.kind)) fail('已有人预约，不能修改时间和类型')
    if (doc.capacity < old.booked) fail('人数上限不能少于已预约人数')
    await db.collection('schedules').doc(old._id).update({ data: doc })
    return Object.assign(old, doc)
  }
  Object.assign(doc, { booked: 0, status: 'active', createdAt: now })
  const res = await db.collection('schedules').add({ data: doc })
  return Object.assign({ _id: res._id }, doc)
}

async function cancelSchedule({ me, data }) {
  need(me, 'staff')
  const s = await getDoc('schedules', data.scheduleId)
  if (!s || s.status !== 'active') fail('课程不存在或已取消')
  const now = Date.now()
  // 先把课程置为已取消，之后新的预约会被 bookSchedule 挡掉
  await db.collection('schedules').doc(s._id).update({ data: { status: 'cancelled' } })

  const list = (await db.collection('bookings').where({ scheduleId: s._id, status: 'booked' }).get()).data
  let cancelled = 0
  for (const b of list) {
    const res = await db.collection('bookings').where({ _id: b._id, status: 'booked' })
      .update({ data: { status: 'cancelled', cancelledAt: now, cancelledBy: 'staff' } })
    if (res.stats && res.stats.updated === 1) {
      // 私教课包把预约占位还回去
      if (b.kind === 'private' && b.cardId) await releaseLessonPending(b.cardId)
      cancelled++
    }
  }
  // 自愈：按真实剩下的 booked 数重算，避免中途失败后计数不一致
  const remain = (await db.collection('bookings').where({ scheduleId: s._id, status: 'booked' }).count()).total
  await db.collection('schedules').doc(s._id).update({ data: { booked: remain } })
  return { cancelledBookings: cancelled }
}

async function loadOwnSchedule(me, scheduleId) {
  need(me, 'coach')
  const s = await getDoc('schedules', scheduleId)
  if (!s) fail('课程不存在')
  if (me.role === 'coach' && s.coachId !== me._id) fail('只能查看自己的课程')
  return s
}

async function roster({ me, data }) {
  const s = await loadOwnSchedule(me, data.scheduleId)
  const bookings = (await db.collection('bookings').where({ scheduleId: s._id, status: _.neq('cancelled') })
    .orderBy('createdAt', 'asc').get()).data
  return { schedule: s, bookings }
}

async function markAttendance({ me, data }) {
  const b = await getDoc('bookings', data.bookingId)
  if (!b || b.type !== 'class') fail('预约不存在')
  await loadOwnSchedule(me, b.scheduleId)
  if (b.status !== 'booked') fail('已经处理过了')
  const now = Date.now()
  const patch = { status: data.status, checkedAt: now, operator: me._id }

  if (data.status === 'attended') {
    if (now < b.startAt - 30 * MIN) fail('开课前 30 分钟内才能签到')
    if (b.kind === 'private') {
      // 扣课包、释放占位、改预约状态放在同一事务里，避免只扣了一半
      await db.runTransaction(async tx => {
        const cur = await txGet(tx, 'bookings', b._id)
        if (!cur || cur.status !== 'booked') fail('已经处理过了')
        const card = await txGet(tx, 'member_cards', b.cardId)
        if (!card || card.remainTimes <= 0) fail('课包次数不足，请先续费')
        await tx.collection('member_cards').doc(b.cardId).update({
          data: {
            remainTimes: card.remainTimes - 1,
            pending: Math.max((card.pending || 0) - 1, 0)
          }
        })
        await tx.collection('bookings').doc(b._id).update({ data: patch })
      })
      await addCardLog({ _id: b.cardId, openid: b.openid }, -1, '私教课消课：' + b.title, me._id)
    } else {
      await db.collection('bookings').doc(b._id).update({ data: patch })
    }
    await addPoints(b.openid, ATTEND_POINTS, '上课签到：' + b.title)
  } else if (data.status === 'absent') {
    if (now < b.startAt) fail('开课后才能标记缺席')
    // 缺席不扣课，把预约时占的位释放掉
    if (b.kind === 'private' && b.cardId) await releaseLessonPending(b.cardId)
    await db.collection('bookings').doc(b._id).update({ data: patch })
    await recordNoShow(b.openid, now)
  } else {
    fail('未知状态')
  }
  return Object.assign(b, patch)
}

// ---------- 娱乐项目 ----------

async function venueBookings({ me, data }) {
  need(me, 'staff')
  dayStart(data.date)
  return (await db.collection('bookings').where({ type: 'venue', date: data.date, status: _.neq('cancelled') })
    .orderBy('startAt', 'asc').limit(200).get()).data
}

async function useVenueBooking({ me, data }) {
  need(me, 'staff')
  const b = await getDoc('bookings', data.bookingId)
  if (!b || b.type !== 'venue') fail('预约不存在')
  if (b.status !== 'booked') fail('该预约已核销或已取消')
  if (b.date !== cnDate(Date.now())) fail('只能核销今天的预约')
  const patch = { status: 'used', usedAt: Date.now(), operator: me._id }
  await db.collection('bookings').doc(b._id).update({ data: patch })
  return Object.assign(b, patch)
}

async function listAllVenues({ me }) {
  need(me, 'staff')
  return (await db.collection('venues').orderBy('createdAt', 'asc').get()).data
}

async function saveVenue({ me, data }) {
  need(me, 'admin')
  const doc = {
    name: text(data.name, 1, 20, '项目名称'),
    desc: text(data.desc, 0, 60, '说明'),
    openHour: int(data.openHour, 0, 23, '开始营业时间'),
    closeHour: int(data.closeHour, 1, 24, '结束营业时间'),
    capacity: int(data.capacity, 1, 100, '每时段名额'),
    price: int(data.price, 0, 10000000, '每时段价格（分）'),
    onSale: data.onSale !== false
  }
  if (doc.closeHour <= doc.openHour) fail('结束时间要晚于开始时间')
  if (data._id) {
    if (!(await getDoc('venues', data._id))) fail('项目不存在')
    await db.collection('venues').doc(data._id).update({ data: doc })
    return Object.assign({ _id: data._id }, doc)
  }
  doc.createdAt = Date.now()
  const res = await db.collection('venues').add({ data: doc })
  return Object.assign({ _id: res._id }, doc)
}

module.exports = {
  dashboard, searchMembers, memberDetail, openCard, adjustCard, setCardStatus, setRole,
  listCardTypes, saveCardType, listCoaches, staffSchedules, saveSchedule, cancelSchedule,
  roster, markAttendance, venueBookings, useVenueBooking, listAllVenues, saveVenue
}
