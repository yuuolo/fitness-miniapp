const { db, _, MIN, HOUR, DAY, cnDate, cnDateTime, cnHour, recordNoShow } = require('./common')
const { notify } = require('./notify')

// 定时触发器每 15 分钟调用一次（见 config.json）
const ABSENT_AFTER_END = 30 * MIN
const REMIND_BEFORE = 2 * HOUR
const EXPIRE_WITHIN = 3 * DAY
const QUIET_BEFORE = 9
const QUIET_FROM = 21
const BATCH = 100

// 课程结束 30 分钟后仍未签到，自动记为缺席
async function markNoShows(now) {
  const list = (await db.collection('bookings')
    .where({ type: 'class', status: 'booked', endAt: _.lt(now - ABSENT_AFTER_END) })
    .limit(BATCH).get()).data
  let count = 0
  for (const b of list) {
    const res = await db.collection('bookings').where({ _id: b._id, status: 'booked' })
      .update({ data: { status: 'absent', checkedAt: now, operator: 'system' } })
    if (res.stats && res.stats.updated === 1) {
      await recordNoShow(b.openid, now)
      count++
    }
  }
  return count
}

// 开课前 2 小时内提醒一次；先占位再发送，避免两次触发重复提醒
async function remindClasses(now) {
  const list = (await db.collection('bookings')
    .where({ type: 'class', status: 'booked', remindedAt: 0, startAt: _.gt(now).and(_.lte(now + REMIND_BEFORE)) })
    .limit(BATCH).get()).data
  let count = 0
  for (const b of list) {
    const res = await db.collection('bookings').where({ _id: b._id, remindedAt: 0 })
      .update({ data: { remindedAt: now } })
    if (res.stats && res.stats.updated === 1) {
      const sent = await notify('classReminder', b.openid, {
        title: b.title, time: cnDateTime(b.startAt), place: b.room || '请准时到店'
      })
      if (sent) count++
    }
  }
  return count
}

// 会员卡 3 天内到期提醒一次，夜间不发
async function remindExpiringCards(now) {
  const hour = cnHour(now)
  if (hour < QUIET_BEFORE || hour >= QUIET_FROM) return 0
  const list = (await db.collection('member_cards')
    .where({ status: 'active', expireRemindedAt: 0, expireAt: _.gt(now).and(_.lte(now + EXPIRE_WITHIN)) })
    .limit(BATCH).get()).data
  let count = 0
  for (const c of list) {
    const res = await db.collection('member_cards').where({ _id: c._id, expireRemindedAt: 0 })
      .update({ data: { expireRemindedAt: now } })
    if (res.stats && res.stats.updated === 1) {
      const tip = c.kind === 'period' ? '续卡请到前台办理' : '还剩 ' + c.remainTimes + ' 次，记得来练'
      const sent = await notify('cardExpire', c.openid, { cardName: c.name, expireDate: cnDate(c.expireAt), tip })
      if (sent) count++
    }
  }
  return count
}

async function runCron(now) {
  const t = now || Date.now()
  const result = {
    absent: await markNoShows(t),
    classReminders: await remindClasses(t),
    cardReminders: await remindExpiringCards(t)
  }
  console.log('cron', cnDateTime(t), JSON.stringify(result))
  return result
}

module.exports = { runCron }
