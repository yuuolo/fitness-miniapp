// 约课 / 娱乐项目预约
const { query, tx } = require('./db')
const {
  MIN, HOUR, DAY, cnDate, cnDateTime, dayStart, fail, need,
  cardUsable, cardRow, scheduleRow, bookingRow, venueRow
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
  const schedules = (await query(
    `select * from schedules where status = 'active' and start_at >= $1 and start_at < $2
     order by start_at asc limit 100`, [from, from + DAY]
  )).rows.map(scheduleRow)
  const mine = (await query(
    `select * from bookings where openid = $1 and type = 'class'
     and start_at >= $2 and start_at < $3 and status <> 'cancelled'`,
    [openid, from, from + DAY]
  )).rows
  const byId = {}
  mine.forEach(b => { byId[b.schedule_id] = b })
  return schedules.map(s => Object.assign(s, {
    myBookingId: byId[s._id] ? byId[s._id].id : '',
    myStatus: byId[s._id] ? byId[s._id].status : ''
  }))
}

async function bookSchedule({ openid, me, data }) {
  const now = Date.now()
  checkCanBook(me, now)
  const s = scheduleRow((await query('select * from schedules where id = $1', [data.scheduleId])).rows[0])
  if (!s || s.status !== 'active') fail('课程不存在或已取消')
  if (s.startAt <= now) fail('课程已经开始了')
  if (s.startAt - now > BOOK_AHEAD_DAYS * DAY) fail('只能预约 7 天内的课程')

  const cards = (await query(
    'select * from member_cards where openid = $1 and status = $2', [openid, 'active']
  )).rows.map(cardRow)

  let card
  if (s.kind === 'private') {
    card = cards.find(c => c.kind === 'lesson' && cardUsable(c, s.startAt))
    if (!card) fail('没有可用的私教课包，请到前台办理')
  } else {
    card = cards.find(c => c.kind !== 'lesson' && cardUsable(c, s.startAt))
    if (!card) fail('没有可用的会员卡，请到前台办理')
  }

  // 同一节课同一个人的预约 id 固定，取消后可再次预约（覆盖旧记录）
  const id = 'c_' + s._id + '_' + openid
  const existing = (await query('select status from bookings where id = $1', [id])).rows[0]
  if (existing && existing.status !== 'cancelled') fail('你已经预约过这节课了')

  let bookedCard = card
  await tx(async client => {
    const cur = (await client.query('select * from schedules where id = $1 for update', [s._id])).rows[0]
    if (!cur || cur.status !== 'active') fail('课程已取消')
    if (cur.booked >= cur.capacity) fail('名额已满')

    // 私教课包：事务内按 pending 选卡并占位，避免并发超额
    if (s.kind === 'private') {
      const lessonCards = (await client.query(
        "select * from member_cards where openid = $1 and kind = 'lesson' and status = 'active' order by created_at asc for update",
        [openid]
      )).rows.map(cardRow)
      const chosen = lessonCards.find(c => c.remainTimes > 0 && cardUsable(c, s.startAt) && c.pending < c.remainTimes)
      if (!chosen) fail('私教课包剩余次数不足，请到前台续费')
      bookedCard = chosen
      await client.query('update member_cards set pending = pending + 1 where id = $1', [chosen._id])
    }

    await client.query('update schedules set booked = booked + 1 where id = $1', [s._id])
    await client.query(
      `insert into bookings (id, type, openid, member_name, member_phone, schedule_id, kind, title,
         coach_id, coach_name, room, date, hour, start_at, end_at, price, card_id, card_name,
         status, reminded_at, created_at)
       values ($1, 'class', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, 0, $14, $15, 'booked', 0, $16)
       on conflict (id) do update set
         member_name = excluded.member_name, member_phone = excluded.member_phone,
         card_id = excluded.card_id, card_name = excluded.card_name,
         status = 'booked', start_at = excluded.start_at, end_at = excluded.end_at,
         cancelled_at = 0, cancelled_by = '', checked_at = 0, operator = '',
         reminded_at = 0, created_at = excluded.created_at`,
      [id, openid, me.nickName || (me.phone ? '会员' + me.phone.slice(-4) : '未命名会员'),
        me.phone, s._id, s.kind, s.courseName, s.coachId, s.coachName, s.room,
        cnDate(s.startAt), s.startAt, s.startAt + s.duration * MIN, bookedCard._id, bookedCard.name, now]
    )
  })

  notify('bookingSuccess', openid, {
    title: s.courseName + '（' + s.coachName + '）',
    time: cnDateTime(s.startAt),
    place: s.room || '前台签到'
  }).catch(err => console.warn('notify failed', err.message))
  return { bookingId: id }
}

async function cancelBooking({ openid, me, data }) {
  need(me, 'member')
  const now = Date.now()
  const b = bookingRow((await query('select * from bookings where id = $1', [data.bookingId])).rows[0])
  if (!b || b.openid !== openid) fail('预约不存在')
  if (b.status !== 'booked') fail('该预约不能取消')
  if (b.type === 'class' && b.startAt - now < CANCEL_BEFORE) fail('开课前 2 小时内不能取消')
  if (b.type === 'venue' && b.startAt <= now) fail('已过开始时间，不能取消')

  await tx(async client => {
    const cur = (await client.query('select * from bookings where id = $1 for update', [b._id])).rows[0]
    if (!cur || cur.status !== 'booked') fail('该预约不能取消')
    await client.query(
      "update bookings set status = 'cancelled', cancelled_at = $2 where id = $1", [b._id, now]
    )
    if (b.type === 'class') {
      await client.query('update schedules set booked = greatest(booked - 1, 0) where id = $1', [b.scheduleId])
      if (b.kind === 'private' && b.cardId) {
        await client.query(
          'update member_cards set pending = greatest(pending - 1, 0) where id = $1', [b.cardId]
        )
      }
    } else if (b.slotId) {
      await client.query('update venue_slots set count = greatest(count - 1, 0) where id = $1', [b.slotId])
    }
  })
  return { ok: true }
}

async function myBookings({ openid, me }) {
  need(me, 'member')
  return (await query(
    'select * from bookings where openid = $1 order by start_at desc limit 50', [openid]
  )).rows.map(bookingRow)
}

async function listVenues() {
  return (await query(
    'select * from venues where on_sale = true order by created_at asc'
  )).rows.map(venueRow)
}

async function venueSlots({ openid, data }) {
  const now = Date.now()
  const venue = venueRow((await query('select * from venues where id = $1', [data.venueId])).rows[0])
  if (!venue || !venue.onSale) fail('项目不存在或已下架')
  const from = checkDateRange(data.date, now)
  const used = (await query(
    'select * from venue_slots where venue_id = $1 and date = $2', [venue._id, data.date]
  )).rows
  const mine = (await query(
    `select * from bookings where openid = $1 and type = 'venue' and venue_id = $2
     and date = $3 and status = 'booked'`, [openid, venue._id, data.date]
  )).rows

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
      myBookingId: my ? my.id : ''
    })
  }
  return { venue, slots }
}

async function bookVenue({ openid, me, data }) {
  const now = Date.now()
  checkCanBook(me, now)
  const venue = venueRow((await query('select * from venues where id = $1', [data.venueId])).rows[0])
  if (!venue || !venue.onSale) fail('项目不存在或已下架')
  const hour = Number(data.hour)
  if (!Number.isInteger(hour) || hour < venue.openHour || hour >= venue.closeHour) fail('不在营业时段内')
  const from = checkDateRange(data.date, now)
  const startAt = from + hour * HOUR
  if (startAt <= now) fail('该时段已经开始了')

  const id = 'v_' + venue._id + '_' + data.date + '_' + hour + '_' + openid
  const existing = (await query('select status from bookings where id = $1', [id])).rows[0]
  if (existing && existing.status === 'booked') fail('你已经预约了这个时段')

  const slotId = venue._id + '_' + data.date + '_' + hour
  await query(
    `insert into venue_slots (id, venue_id, date, hour, count) values ($1, $2, $3, $4, 0)
     on conflict (id) do nothing`, [slotId, venue._id, data.date, hour]
  )

  await tx(async client => {
    const slot = (await client.query('select * from venue_slots where id = $1 for update', [slotId])).rows[0]
    if (!slot) fail('时段数据异常，请重试')
    if (slot.count >= venue.capacity) fail('该时段已约满')
    await client.query('update venue_slots set count = count + 1 where id = $1', [slotId])
    await client.query(
      `insert into bookings (id, type, openid, member_name, member_phone, venue_id, slot_id,
         title, date, hour, start_at, end_at, price, status, created_at)
       values ($1, 'venue', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'booked', $13)
       on conflict (id) do update set
         member_name = excluded.member_name, member_phone = excluded.member_phone,
         status = 'booked', start_at = excluded.start_at, end_at = excluded.end_at,
         cancelled_at = 0, cancelled_by = '', used_at = 0, operator = '', created_at = excluded.created_at`,
      [id, openid, me.nickName || (me.phone ? '会员' + me.phone.slice(-4) : '未命名会员'),
        me.phone, venue._id, slotId, venue.name, data.date, hour, startAt, startAt + HOUR,
        venue.price, now]
    )
  })

  notify('bookingSuccess', openid, {
    title: venue.name,
    time: cnDateTime(startAt),
    place: '到店付款 ' + (venue.price / 100) + ' 元'
  }).catch(err => console.warn('notify failed', err.message))
  return { bookingId: id }
}

module.exports = { listSchedules, bookSchedule, cancelBooking, myBookings, listVenues, venueSlots, bookVenue }
