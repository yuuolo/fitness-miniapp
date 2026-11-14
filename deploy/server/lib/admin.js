// 员工/管理员操作：工作台、会员、卡务、排课、签到、娱乐项目
const { query, tx } = require('./db')
const {
  MIN, DAY, cnDate, dayStart, fail, need, newId, memberLabel, cardUsable,
  memberRow, cardTypeRow, cardRow, bookingRow, paymentRow, scheduleRow,
  venueRow, entryLogRow, addPoints, addCardLog, recordNoShow, releaseLessonPending,
  ROLE_LEVEL
} = require('./common')

const PAY_METHODS = { cash: '现金', wechat_qr: '微信收款码', alipay_qr: '支付宝收款码', pos: 'POS 刷卡', free: '赠送' }
const CARD_KINDS = ['period', 'times', 'lesson']
const ATTEND_POINTS = 5

// 事务外也能复用同一套写函数
const db = { query }

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

function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, c => '\\' + c)
}

// 各表主键列名（members 用 openid 作主键）
const PK = { members: 'openid' }

async function getRow(table, id) {
  const key = PK[table] || 'id'
  const { rows } = await query(`select * from ${table} where ${key} = $1`, [id])
  return rows[0] || null
}

async function dashboard({ me }) {
  need(me, 'coach')
  const now = Date.now()
  const today = cnDate(now)
  const from = dayStart(today)

  const params = [from, from + DAY]
  let coachFilter = ''
  if (me.role === 'coach') {
    params.push(me._id)
    coachFilter = ' and coach_id = $3'
  }
  const classBookings = (await query(
    `select count(*)::int as n from bookings
     where type = 'class' and start_at >= $1 and start_at < $2 and status <> 'cancelled'${coachFilter}`,
    params
  )).rows[0].n

  const result = { role: me.role, today, classBookings }
  if ((ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.staff) {
    result.entries = (await query(
      "select count(*)::int as n from entry_logs where date = $1 and result = 'ok'", [today]
    )).rows[0].n
    result.venueBookings = (await query(
      "select count(*)::int as n from bookings where type = 'venue' and date = $1 and status <> 'cancelled'",
      [today]
    )).rows[0].n
    result.members = (await query('select count(*)::int as n from members')).rows[0].n
  }
  return result
}

// ---------- 会员 ----------

async function searchMembers({ me, data }) {
  need(me, 'coach')
  const kw = String(data.keyword || '').trim()
  if (!kw) {
    return (await query('select * from members order by created_at desc limit 50')).rows.map(memberRow)
  }
  const pattern = '%' + likeEscape(kw) + '%'
  const column = /^\d+$/.test(kw) ? 'phone' : 'nick_name'
  return (await query(
    `select * from members where ${column} ilike $1 order by created_at desc limit 50`, [pattern]
  )).rows.map(memberRow)
}

async function memberDetail({ me, data }) {
  need(me, 'coach')
  const member = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!member) fail('会员不存在')
  const now = Date.now()
  const cards = (await query(
    'select * from member_cards where openid = $1 order by created_at desc limit 50', [member._id]
  )).rows.map(cardRow)
  const bookings = (await query(
    'select * from bookings where openid = $1 order by start_at desc limit 20', [member._id]
  )).rows.map(bookingRow)
  const entries = (await query(
    'select * from entry_logs where openid = $1 order by created_at desc limit 10', [member._id]
  )).rows.map(entryLogRow)
  return {
    member,
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    bookings,
    entries
  }
}

async function openCard({ me, data }) {
  need(me, 'staff')
  const member = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!member) fail('会员不存在')
  const type = cardTypeRow((await query('select * from card_types where id = $1', [data.typeId])).rows[0])
  if (!type) fail('卡种不存在')
  const amount = int(data.amount, 0, 10000000, '实收金额（分）')
  if (!PAY_METHODS[data.payMethod]) fail('请选择收款方式')
  const remark = text(data.remark, 0, 100, '备注')

  const now = Date.now()
  const times = type.kind === 'period' ? 0 : type.times
  const cardId = newId()

  return tx(async client => {
    await client.query(
      `insert into member_cards (id, openid, type_id, name, kind, remain_times, total_times,
         pending, start_at, expire_at, status, paused_at, expire_reminded_at, operator, created_at)
       values ($1, $2, $3, $4, $5, $6, $6, 0, $7, $8, 'active', 0, 0, $9, $7)`,
      [cardId, member._id, type._id, type.name, type.kind, times, now, now + type.days * DAY, me._id]
    )
    await addCardLog(client, { _id: cardId, openid: member._id }, times, '开卡', me._id)
    await client.query(
      `insert into offline_payments (id, openid, member_name, card_id, type_name, list_price,
         amount, pay_method, pay_method_name, remark, operator, operator_name, date, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [newId(), member._id, memberLabel(member), cardId, type.name, type.price, amount,
        data.payMethod, PAY_METHODS[data.payMethod], remark, me._id, memberLabel(me),
        cnDate(now), now]
    )
    return cardRow((await client.query('select * from member_cards where id = $1', [cardId])).rows[0])
  })
}

async function adjustCard({ me, data }) {
  need(me, 'staff')
  const remark = text(data.remark, 1, 100, '调整原因')
  const delta = int(data.delta || 0, -1000, 1000, '次数调整')
  const extendDays = int(data.extendDays || 0, -3650, 3650, '延期天数')
  if (!delta && !extendDays) fail('请填写调整次数或延期天数')

  return tx(async client => {
    const card = cardRow((await client.query('select * from member_cards where id = $1 for update', [data.cardId])).rows[0])
    if (!card) fail('会员卡不存在')
    if (delta && card.kind === 'period') fail('期限卡没有次数')

    const nextTimes = card.remainTimes + delta
    if (nextTimes < 0) fail('剩余次数不足')
    const nextExpire = extendDays ? card.expireAt + extendDays * DAY : card.expireAt
    if (extendDays < 0 && nextExpire < card.startAt) fail('有效期不能早于开卡时间')

    await client.query(
      `update member_cards set remain_times = $2, expire_at = $3,
         expire_reminded_at = case when $4 then 0 else expire_reminded_at end
       where id = $1`,
      [card._id, nextTimes, nextExpire, extendDays !== 0]
    )
    const note = extendDays ? '（有效期 ' + (extendDays > 0 ? '+' : '') + extendDays + ' 天）' : ''
    await addCardLog(client, card, delta, remark + note, me._id)
    return cardRow((await client.query('select * from member_cards where id = $1', [card._id])).rows[0])
  })
}

async function setCardStatus({ me, data }) {
  need(me, 'staff')
  const now = Date.now()
  const names = { paused: '停卡', active: '恢复', void: '作废' }
  if (!names[data.status]) fail('未知状态')

  return tx(async client => {
    const card = cardRow((await client.query('select * from member_cards where id = $1 for update', [data.cardId])).rows[0])
    if (!card) fail('会员卡不存在')

    let sql
    let params
    if (data.status === 'paused') {
      if (card.status !== 'active') fail('只有正常状态的卡可以停卡')
      sql = "update member_cards set status = 'paused', paused_at = $2 where id = $1"
      params = [card._id, now]
    } else if (data.status === 'active') {
      if (card.status !== 'paused') fail('这张卡没有停卡')
      // 停卡期间不计有效期：恢复时把停掉的时长补回去
      sql = `update member_cards set status = 'active', paused_at = 0,
               expire_at = expire_at + $2, expire_reminded_at = 0 where id = $1`
      params = [card._id, now - card.pausedAt]
    } else {
      if (card.status === 'void') fail('这张卡已作废')
      sql = "update member_cards set status = 'void' where id = $1"
      params = [card._id]
    }
    await client.query(sql, params)
    await addCardLog(client, card, 0, names[data.status], me._id)
    return cardRow((await client.query('select * from member_cards where id = $1', [card._id])).rows[0])
  })
}

async function setRole({ me, data }) {
  need(me, 'admin')
  if (!Object.prototype.hasOwnProperty.call(ROLE_LEVEL, data.role)) fail('未知角色')
  if (data.openid === me._id) fail('不能修改自己的角色')
  const member = await getRow('members', data.openid)
  if (!member) fail('会员不存在')
  await query('update members set role = $2 where openid = $1', [member.openid, data.role])
  return { role: data.role }
}

// 教练/前台代会员补充基本资料（会员自己不会填手机号时常用）
async function staffUpdateProfile({ me, data }) {
  need(me, 'coach')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')

  const sets = []
  const values = [target._id]
  const push = (column, value) => { values.push(value); sets.push(column + ' = $' + values.length) }

  if (data.nickName !== undefined) {
    const n = String(data.nickName).trim()
    if (!n || n.length > 20) fail('昵称需为 1–20 个字')
    push('nick_name', n)
  }
  if (data.phone !== undefined) {
    const p = String(data.phone).trim()
    if (p && !/^1\d{10}$/.test(p)) fail('手机号需为 11 位')
    push('phone', p)
  }
  if (data.gender !== undefined) {
    const g = String(data.gender)
    if (!['male', 'female', ''].includes(g)) fail('性别取值不正确')
    push('gender', g)
  }
  if (data.height !== undefined) {
    const h = Number(data.height) || 0
    if (h && (h < 80 || h > 250)) fail('身高需在 80–250 之间')
    push('height', h)
  }
  if (!sets.length) fail('没有要修改的内容')

  await query(`update members set ${sets.join(', ')} where openid = $1`, values)
  return memberRow((await query('select * from members where openid = $1', [target._id])).rows[0])
}

// ---------- 卡种 ----------

async function listCardTypes({ me }) {
  need(me, 'staff')
  return (await query('select * from card_types order by created_at asc')).rows.map(cardTypeRow)
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
    if (!(await getRow('card_types', data._id))) fail('卡种不存在')
    await query(
      `update card_types set name = $2, kind = $3, times = $4, days = $5,
         price = $6, descr = $7, on_sale = $8 where id = $1`,
      [data._id, doc.name, doc.kind, doc.times, doc.days, doc.price, doc.desc, doc.onSale]
    )
    return Object.assign({ _id: data._id }, doc)
  }
  const id = newId()
  await query(
    `insert into card_types (id, name, kind, times, days, price, descr, on_sale, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, doc.name, doc.kind, doc.times, doc.days, doc.price, doc.desc, doc.onSale, Date.now()]
  )
  return Object.assign({ _id: id }, doc)
}

// ---------- 课程 ----------

async function listCoaches({ me }) {
  need(me, 'staff')
  const list = (await query(
    "select * from members where role in ('coach', 'staff', 'admin') limit 100"
  )).rows.map(memberRow)
  return list.map(m => ({ _id: m._id, name: memberLabel(m), role: m.role }))
}

async function staffSchedules({ me, data }) {
  need(me, 'coach')
  const from = dayStart(data.date)
  const params = [from, from + DAY]
  let coachFilter = ''
  if (me.role === 'coach') {
    params.push(me._id)
    coachFilter = ' and coach_id = $3'
  }
  return (await query(
    `select * from schedules where start_at >= $1 and start_at < $2${coachFilter}
     order by start_at asc limit 100`, params
  )).rows.map(scheduleRow)
}

async function saveSchedule({ me, data }) {
  need(me, 'staff')
  const now = Date.now()
  const kind = data.kind === 'private' ? 'private' : 'group'
  const coach = memberRow((await query('select * from members where openid = $1', [data.coachId])).rows[0])
  if (!coach || (ROLE_LEVEL[coach.role] || 0) < ROLE_LEVEL.coach) fail('请选择教练')
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
    const old = scheduleRow((await query('select * from schedules where id = $1', [data._id])).rows[0])
    if (!old || old.status !== 'active') fail('课程不存在或已取消')
    if (old.booked > 0 && (old.startAt !== doc.startAt || old.kind !== doc.kind)) fail('已有人预约，不能修改时间和类型')
    if (doc.capacity < old.booked) fail('人数上限不能少于已预约人数')
    await query(
      `update schedules set course_name = $2, kind = $3, coach_id = $4, coach_name = $5,
         start_at = $6, duration = $7, capacity = $8, room = $9 where id = $1`,
      [old._id, doc.courseName, doc.kind, doc.coachId, doc.coachName,
        doc.startAt, doc.duration, doc.capacity, doc.room]
    )
    return scheduleRow((await query('select * from schedules where id = $1', [old._id])).rows[0])
  }

  const id = newId()
  await query(
    `insert into schedules (id, course_name, kind, coach_id, coach_name, start_at,
       duration, capacity, booked, room, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'active', $10)`,
    [id, doc.courseName, doc.kind, doc.coachId, doc.coachName, doc.startAt,
      doc.duration, doc.capacity, doc.room, now]
  )
  return scheduleRow((await query('select * from schedules where id = $1', [id])).rows[0])
}

async function cancelSchedule({ me, data }) {
  need(me, 'staff')
  const s = scheduleRow((await query('select * from schedules where id = $1', [data.scheduleId])).rows[0])
  if (!s || s.status !== 'active') fail('课程不存在或已取消')
  const now = Date.now()

  // 先把课程置为已取消，之后新的预约会被 bookSchedule 挡掉
  await query("update schedules set status = 'cancelled' where id = $1", [s._id])

  // 取消所有仍在 booked 状态的预约（条件更新保证每单只处理一次）
  return tx(async client => {
    const cancelledRows = (await client.query(
      `update bookings set status = 'cancelled', cancelled_at = $2, cancelled_by = 'staff'
       where schedule_id = $1 and status = 'booked'
       returning *`,
      [s._id, now]
    )).rows
    for (const b of cancelledRows) {
      if (b.kind === 'private' && b.card_id) await releaseLessonPending(client, b.card_id)
    }
    // 自愈：按真实剩下的 booked 数重算，避免中途失败后计数不一致
    const remain = (await client.query(
      "select count(*)::int as n from bookings where schedule_id = $1 and status = 'booked'", [s._id]
    )).rows[0].n
    await client.query('update schedules set booked = $2 where id = $1', [s._id, remain])
    return { cancelledBookings: cancelledRows.length }
  })
}

async function loadOwnSchedule(me, scheduleId) {
  need(me, 'coach')
  const s = scheduleRow((await query('select * from schedules where id = $1', [scheduleId])).rows[0])
  if (!s) fail('课程不存在')
  if (me.role === 'coach' && s.coachId !== me._id) fail('只能查看自己的课程')
  return s
}

async function roster({ me, data }) {
  const s = await loadOwnSchedule(me, data.scheduleId)
  const bookings = (await query(
    "select * from bookings where schedule_id = $1 and status <> 'cancelled' order by created_at asc",
    [s._id]
  )).rows.map(bookingRow)
  return { schedule: s, bookings }
}

async function markAttendance({ me, data }) {
  const b = bookingRow((await query('select * from bookings where id = $1', [data.bookingId])).rows[0])
  if (!b || b.type !== 'class') fail('预约不存在')
  await loadOwnSchedule(me, b.scheduleId)
  if (b.status !== 'booked') fail('已经处理过了')
  const now = Date.now()

  if (data.status === 'attended') {
    if (now < b.startAt - 30 * MIN) fail('开课前 30 分钟内才能签到')
    if (b.kind === 'private') {
      // 扣课包、释放占位、改预约状态放在同一事务里
      await tx(async client => {
        const cur = (await client.query('select * from bookings where id = $1 for update', [b._id])).rows[0]
        if (!cur || cur.status !== 'booked') fail('已经处理过了')
        const card = (await client.query('select * from member_cards where id = $1 for update', [b.cardId])).rows[0]
        if (!card || card.remain_times <= 0) fail('课包次数不足，请先续费')
        await client.query(
          `update member_cards set remain_times = remain_times - 1,
             pending = greatest(pending - 1, 0) where id = $1`,
          [b.cardId]
        )
        await client.query(
          "update bookings set status = 'attended', checked_at = $2, operator = $3 where id = $1",
          [b._id, now, me._id]
        )
      })
      await addCardLog(db, { _id: b.cardId, openid: b.openid }, -1, '私教课消课：' + b.title, me._id)
    } else {
      await query(
        "update bookings set status = 'attended', checked_at = $2, operator = $3 where id = $1",
        [b._id, now, me._id]
      )
    }
    await addPoints(db, b.openid, ATTEND_POINTS, '上课签到：' + b.title)
  } else if (data.status === 'absent') {
    if (now < b.startAt) fail('开课后才能标记缺席')
    // 缺席不扣课，把预约时占的位释放掉
    if (b.kind === 'private' && b.cardId) await releaseLessonPending(db, b.cardId)
    await query(
      "update bookings set status = 'absent', checked_at = $2, operator = $3 where id = $1",
      [b._id, now, me._id]
    )
    await recordNoShow(db, b.openid, now)
  } else {
    fail('未知状态')
  }
  return bookingRow((await query('select * from bookings where id = $1', [b._id])).rows[0])
}

// ---------- 娱乐项目 ----------

async function venueBookings({ me, data }) {
  need(me, 'staff')
  dayStart(data.date)
  return (await query(
    `select * from bookings where type = 'venue' and date = $1 and status <> 'cancelled'
     order by start_at asc limit 200`, [data.date]
  )).rows.map(bookingRow)
}

async function useVenueBooking({ me, data }) {
  need(me, 'staff')
  const b = bookingRow((await query('select * from bookings where id = $1', [data.bookingId])).rows[0])
  if (!b || b.type !== 'venue') fail('预约不存在')
  if (b.status !== 'booked') fail('该预约已核销或已取消')
  if (b.date !== cnDate(Date.now())) fail('只能核销今天的预约')
  await query(
    "update bookings set status = 'used', used_at = $2, operator = $3 where id = $1",
    [b._id, Date.now(), me._id]
  )
  return bookingRow((await query('select * from bookings where id = $1', [b._id])).rows[0])
}

async function listAllVenues({ me }) {
  need(me, 'staff')
  return (await query('select * from venues order by created_at asc')).rows.map(venueRow)
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
    if (!(await getRow('venues', data._id))) fail('项目不存在')
    await query(
      `update venues set name = $2, descr = $3, open_hour = $4, close_hour = $5,
         capacity = $6, price = $7, on_sale = $8 where id = $1`,
      [data._id, doc.name, doc.desc, doc.openHour, doc.closeHour, doc.capacity, doc.price, doc.onSale]
    )
    return Object.assign({ _id: data._id }, doc)
  }
  const id = newId()
  await query(
    `insert into venues (id, name, descr, open_hour, close_hour, capacity, price, on_sale, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, doc.name, doc.desc, doc.openHour, doc.closeHour, doc.capacity, doc.price, doc.onSale, Date.now()]
  )
  return Object.assign({ _id: id }, doc)
}

module.exports = {
  dashboard, searchMembers, memberDetail, staffUpdateProfile,
  openCard, adjustCard, setCardStatus, setRole,
  listCardTypes, saveCardType, listCoaches, staffSchedules, saveSchedule, cancelSchedule,
  roster, markAttendance, venueBookings, useVenueBooking, listAllVenues, saveVenue
}
