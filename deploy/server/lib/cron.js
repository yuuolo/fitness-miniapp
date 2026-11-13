// 定时任务（等价云开发定时触发器）：自动记缺席、开课前提醒、会员卡到期提醒
const { query, tx } = require('./db')
const {
  MIN, HOUR, DAY, cnDate, cnDateTime, cnHour, wxTime, wxDate,
  addCardLog, recordNoShow, releaseLessonPending
} = require('./common')
const { notify } = require('./notify')

const ABSENT_AFTER_END = 30 * MIN
const REMIND_BEFORE = 2 * HOUR
const EXPIRE_WITHIN = 3 * DAY
const QUIET_BEFORE = 9
const QUIET_FROM = 21
const BATCH = 100
const MAX_ROUNDS = 20

// 课程结束 30 分钟后仍未签到，自动记为缺席
async function markNoShows(now) {
  let count = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const claimed = (await query(
      `update bookings set status = 'absent', checked_at = $1, operator = 'system'
       where id in (
         select id from bookings
         where type = 'class' and status = 'booked' and end_at < $2
         limit $3
       )
       returning *`,
      [now, now - ABSENT_AFTER_END, BATCH]
    )).rows
    if (!claimed.length) break
    for (const b of claimed) {
      await tx(async client => {
        if (b.kind === 'private' && b.card_id) await releaseLessonPending(client, b.card_id)
        await recordNoShow(client, b.openid, now)
      })
      count++
    }
    if (claimed.length < BATCH) break
  }
  return count
}

// 开课前 2 小时内提醒一次：先原子占位再发送，避免重复提醒
async function remindClasses(now) {
  let count = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const claimed = (await query(
      `update bookings set reminded_at = $1
       where id in (
         select id from bookings
         where type = 'class' and status = 'booked' and reminded_at = 0
           and start_at > $1 and start_at <= $2
         limit $3
       )
       returning *`,
      [now, now + REMIND_BEFORE, BATCH]
    )).rows
    if (!claimed.length) break
    for (const b of claimed) {
      const sent = await notify('classReminder', b.openid, {
        who: b.member_name || '会员',
        time: wxTime(b.start_at),
        place: b.room || '店内'
      })
      if (sent) count++
    }
    if (claimed.length < BATCH) break
  }
  return count
}

// 会员卡 3 天内到期提醒一次，夜间不发
async function remindExpiringCards(now) {
  const hour = cnHour(now)
  if (hour < QUIET_BEFORE || hour >= QUIET_FROM) return 0
  let count = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const claimed = (await query(
      `update member_cards set expire_reminded_at = $1
       where id in (
         select id from member_cards
         where status = 'active' and expire_reminded_at = 0
           and expire_at > $1 and expire_at <= $2
         limit $3
       )
       returning *`,
      [now, now + EXPIRE_WITHIN, BATCH]
    )).rows
    if (!claimed.length) break
    for (const c of claimed) {
      const tip = c.kind === 'period' ? '续卡请到前台办理' : '还剩 ' + c.remain_times + ' 次，记得来练'
      const m = (await query('select nick_name, phone from members where openid = $1', [c.openid])).rows[0]
      const who = (m && m.nick_name) || (m && m.phone ? '会员' + String(m.phone).slice(-4) : '会员')
      const sent = await notify('cardExpire', c.openid, {
        who,
        cardName: c.name,
        expireDate: wxDate(c.expire_at),
        tip
      })
      if (sent) count++
    }
    if (claimed.length < BATCH) break
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
  return result
}

module.exports = { runCron, markNoShows, remindClasses, remindExpiringCards }
