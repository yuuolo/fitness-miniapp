const {
  db, _, MIN, HOUR, DAY, cnDate, cnDateTime, dayStart, fail, need, getDoc, txGet, cardUsable, memberLabel
} = require('./common')
const { notify } = require('./notify')

const BOOK_AHEAD_DAYS = 7
const CANCEL_BEFORE = 2 * HOUR

function checkCanBook(me, now) {
  need(me, 'member')
  if (!me.phone) fail('请先在「我的」中填写手机号')
  if (me.blockUntil && me.blockUntil > now) {
    fail('缺席次数过多，' + cnDate(me.blockUntil) + ' 前暂停预约')
  }
}

function checkDateRange(dateStr, now) {
  const from = dayStart(dateStr)
  const today = dayStart(cnDate(now))
  if (from < today || from >= today + BOOK_AHEAD_DAYS * DAY) fail('只能查看和预约 7 天内的时段')
  return from
}

async function listSchedules({ openid, data }) {
  const from = dayStart(data.date)
  const schedules = (await db.collection('schedules')
    .where({ status: 'active', startAt: _.gte(from).and(_.lt(from + DAY)) })
    .orderBy('startAt', 'asc').limit(100).get()).data
  const mine = (await db.collection('bookings')
    .where({ openid, type: 'class', startAt: _.gte(from).and(_.lt(from + DAY)), status: _.neq('cancelled') })
    .get()).data
  const byId = {}
  mine.forEach(b => { byId[b.scheduleId] = b })
  return schedules.map(s => Object.assign(s, {
    myBookingId: byId[s._id] ? byId[s._id]._id : '',
    myStatus: byId[s._id] ? byId[s._id].status : ''
  }))
}

async function bookSchedule({ openid, me, data }) {
  const now = Date.now()
  checkCanBook(me, now)
  const s = await getDoc('schedules', data.scheduleId)
  if (!s || s.status !== 'active') fail('课程不存在或已取消')
  if (s.startAt <= now) fail('课程已经开始了')
  if (s.startAt - now > BOOK_AHEAD_DAYS * DAY) fail('只能预约 7 天内的课程')

  const cards = (await db.collection('member_cards').where({ openid, status: 'active' }).get()).data
  let card
  let lessonCandidates = []
  if (s.kind === 'private') {
    lessonCandidates = cards.filter(c => c.kind === 'lesson' && cardUsable(c, s.startAt))
    if (!lessonCandidates.length) fail('没有可用的私教课包，请到前台办理')
    card = lessonCandidates[0]
  } else {
    card = cards.find(c => c.kind !== 'lesson' && cardUsable(c, s.startAt))
    if (!card) fail('没有可用的会员卡，请到前台办理')
  }

  const id = 'c_' + s._id + '_' + openid
  const existing = await getDoc('bookings', id)
  if (existing && existing.status !== 'cancelled') fail('你已经预约过这节课了')

  let bookedCard = card
  await db.runTransaction(async tx => {
    const cur = await txGet(tx, 'schedules', s._id)
    if (!cur || cur.status !== 'active') fail('课程已取消')
    if (cur.booked >= cur.capacity) fail('名额已满')

    // 私教课包：在事务内选卡并占位（pending +1），
    // 避免「先查已占用数、再写预约」之间被并发插入导致超额预约
    if (s.kind === 'private') {
      let chosen = null
      for (const c of lessonCandidates) {
        const cardDoc = await txGet(tx, 'member_cards', c._id)
        if (!cardDoc || cardDoc.status !== 'active') continue
        const pending = cardDoc.pending || 0
        if (pending >= cardDoc.remainTimes) continue
        chosen = cardDoc
        break
      }
      if (!chosen) fail('私教课包剩余次数不足，请到前台续费')
      bookedCard = chosen
      await tx.collection('member_cards').doc(chosen._id)
        .update({ data: { pending: (chosen.pending || 0) + 1 } })
    }

    await tx.collection('schedules').doc(s._id).update({ data: { booked: _.inc(1) } })
    await tx.collection('bookings').doc(id).set({
      data: {
        type: 'class', openid, memberName: memberLabel(me), memberPhone: me.phone,
        scheduleId: s._id, kind: s.kind, title: s.courseName, coachId: s.coachId, coachName: s.coachName,
        room: s.room, startAt: s.startAt, endAt: s.startAt + s.duration * MIN, date: cnDate(s.startAt),
        cardId: bookedCard._id, cardName: bookedCard.name, status: 'booked', remindedAt: 0, createdAt: now
      }
    })
  })
  await notify('bookingSuccess', openid, {
    title: s.courseName + '（' + s.coachName + '）', time: cnDateTime(s.startAt), place: s.room || '前台签到'
  })
  return { bookingId: id }
}

async function cancelBooking({ openid, me, data }) {
  need(me, 'member')
  const now = Date.now()
  const b = await getDoc('bookings', data.bookingId)
  if (!b || b.openid !== openid) fail('预约不存在')
  if (b.status !== 'booked') fail('该预约不能取消')
  if (b.type === 'class' && b.startAt - now < CANCEL_BEFORE) fail('开课前 2 小时内不能取消')
  if (b.type === 'venue' && b.startAt <= now) fail('已过开始时间，不能取消')

  await db.runTransaction(async tx => {
    const cur = await txGet(tx, 'bookings', b._id)
    if (!cur || cur.status !== 'booked') fail('该预约不能取消')
    await tx.collection('bookings').doc(b._id).update({ data: { status: 'cancelled', cancelledAt: now } })
    if (b.type === 'class') {
      await tx.collection('schedules').doc(b.scheduleId).update({ data: { booked: _.inc(-1) } })
      // 私教课包释放预约占位
      if (b.kind === 'private' && b.cardId) {
        const cardDoc = await txGet(tx, 'member_cards', b.cardId)
        if (cardDoc && (cardDoc.pending || 0) > 0) {
          await tx.collection('member_cards').doc(b.cardId)
            .update({ data: { pending: cardDoc.pending - 1 } })
        }
      }
    } else {
      await tx.collection('venue_slots').doc(b.slotId).update({ data: { count: _.inc(-1) } })
    }
  })
  return { ok: true }
}

async function myBookings({ openid, me }) {
  need(me, 'member')
  return (await db.collection('bookings').where({ openid })
    .orderBy('startAt', 'desc').limit(50).get()).data
}

async function listVenues() {
  return (await db.collection('venues').where({ onSale: true }).orderBy('createdAt', 'asc').get()).data
}

async function venueSlots({ openid, data }) {
  const now = Date.now()
  const venue = await getDoc('venues', data.venueId)
  if (!venue || !venue.onSale) fail('项目不存在或已下架')
  const from = checkDateRange(data.date, now)
  const used = (await db.collection('venue_slots').where({ venueId: venue._id, date: data.date }).get()).data
  const mine = (await db.collection('bookings')
    .where({ openid, type: 'venue', venueId: venue._id, date: data.date, status: 'booked' }).get()).data
  const slots = []
  for (let h = venue.openHour; h < venue.closeHour; h++) {
    const slot = used.find(u => u.hour === h)
    const my = mine.find(b => b.hour === h)
    const startAt = from + h * HOUR
    slots.push({
      hour: h,
      label: String(h).padStart(2, '0') + ':00',
      remain: venue.capacity - (slot ? slot.count : 0),
      past: startAt <= now,
      myBookingId: my ? my._id : ''
    })
  }
  return { venue, slots }
}

async function bookVenue({ openid, me, data }) {
  const now = Date.now()
  checkCanBook(me, now)
  const venue = await getDoc('venues', data.venueId)
  if (!venue || !venue.onSale) fail('项目不存在或已下架')
  const hour = Number(data.hour)
  if (!Number.isInteger(hour) || hour < venue.openHour || hour >= venue.closeHour) fail('不在营业时段内')
  const from = checkDateRange(data.date, now)
  const startAt = from + hour * HOUR
  if (startAt <= now) fail('该时段已经开始了')

  const id = 'v_' + venue._id + '_' + data.date + '_' + hour + '_' + openid
  const existing = await getDoc('bookings', id)
  if (existing && existing.status === 'booked') fail('你已经预约了这个时段')

  const slotId = venue._id + '_' + data.date + '_' + hour
  try {
    await db.collection('venue_slots').add({ data: { _id: slotId, venueId: venue._id, date: data.date, hour, count: 0 } })
  } catch (e) { /* 时段记录已存在 */ }

  await db.runTransaction(async tx => {
    const slot = await txGet(tx, 'venue_slots', slotId)
    if (!slot) fail('时段数据异常，请重试')
    if (slot.count >= venue.capacity) fail('该时段已约满')
    await tx.collection('venue_slots').doc(slotId).update({ data: { count: _.inc(1) } })
    await tx.collection('bookings').doc(id).set({
      data: {
        type: 'venue', openid, memberName: memberLabel(me), memberPhone: me.phone,
        venueId: venue._id, title: venue.name, slotId, date: data.date, hour,
        startAt, endAt: startAt + HOUR, price: venue.price, status: 'booked', createdAt: now
      }
    })
  })
  await notify('bookingSuccess', openid, {
    title: venue.name, time: cnDateTime(startAt), place: '到店付款 ' + (venue.price / 100) + ' 元'
  })
  return { bookingId: id }
}

module.exports = { listSchedules, bookSchedule, cancelBooking, myBookings, listVenues, venueSlots, bookVenue }
