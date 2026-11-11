const crypto = require('crypto')
const { db, DAY, HOUR, cnDate, dayStart, fail, getDoc } = require('./common')

// 注意：初始化时按这些名字建集合；卡包占位计数没有额外集合，
// 而是存在 member_cards.pending 字段上（见 booking.js）
const COLLECTIONS = [
  'config', 'members', 'card_types', 'member_cards', 'card_logs', 'offline_payments',
  'schedules', 'bookings', 'venues', 'venue_slots', 'entry_logs', 'points_logs'
]

async function isInitialized() {
  return !!(await getDoc('config', 'system'))
}

async function systemStatus() {
  return { initialized: await isInitialized() }
}

async function countOf(coll) {
  return (await db.collection(coll).count()).total
}

const CARD_TYPES = [
  { name: '月卡', kind: 'period', times: 0, days: 30, price: 29900, desc: '30 天内不限次入场，含全部团课' },
  { name: '年卡', kind: 'period', times: 0, days: 365, price: 238800, desc: '365 天不限次入场，含全部团课' },
  { name: '10 次卡', kind: 'times', times: 10, days: 180, price: 49900, desc: '每天首次入场扣 1 次，180 天有效' },
  { name: '私教 10 节', kind: 'lesson', times: 10, days: 180, price: 299000, desc: '一对一私教课 10 节，180 天有效' }
]

const VENUES = [
  { name: '攀岩墙', desc: '含装备与安全员', openHour: 10, closeHour: 22, capacity: 6, price: 6800 },
  { name: '蹦床乐园', desc: '每场 1 小时，需穿防滑袜', openHour: 10, closeHour: 21, capacity: 12, price: 5800 },
  { name: '台球桌', desc: '中式八球，每桌最多 4 人', openHour: 12, closeHour: 24, capacity: 1, price: 4000 },
  { name: 'KTV 包间', desc: '小包 2–6 人', openHour: 14, closeHour: 24, capacity: 1, price: 8800 }
]

const CLASSES = [
  { courseName: '晨间瑜伽', hour: 9, duration: 60, capacity: 15, room: '瑜伽室' },
  { courseName: '动感单车', hour: 19, duration: 45, capacity: 20, room: '单车房' },
  { courseName: '燃脂搏击', hour: 20, duration: 60, capacity: 16, room: '综合训练区' }
]

// 第一个调用者成为管理员，并写入示例卡种、娱乐项目和课程。
// 初始化哨兵（config/system）放在最后写：中途超时或失败不会被误标记为已初始化，
// 店长重新点一次即可续上；示例数据按集合判空写入，重复执行不会产生重复数据。
async function bootstrap({ openid, me }) {
  if (await isInitialized()) fail('系统已经初始化过了')

  // 云函数默认 3 秒超时，建表并发进行
  await Promise.all(COLLECTIONS.map(name => db.createCollection(name).catch(() => { /* 已存在 */ })))

  const now = Date.now()

  // ---------- 管理员 ----------
  if (me) {
    await db.collection('members').doc(openid).update({ data: { role: 'admin' } })
  } else {
    await db.collection('members').add({
      data: { _id: openid, nickName: '', phone: '', role: 'admin', points: 0, noShow: 0, blockUntil: 0, createdAt: now }
    })
  }

  // ---------- 示例数据（按集合判空，可重复执行）----------
  const writes = []

  if (!(await countOf('card_types'))) {
    CARD_TYPES.forEach((t, i) => writes.push(
      db.collection('card_types').add({ data: Object.assign({ onSale: true, createdAt: now + i }, t) })))
  }

  if (!(await countOf('venues'))) {
    VENUES.forEach((v, i) => writes.push(
      db.collection('venues').add({ data: Object.assign({ onSale: true, createdAt: now + i }, v) })))
  }

  if (!(await countOf('schedules'))) {
    const coachName = me && me.nickName ? me.nickName : '管理员'
    const today = cnDate(now)
    for (let d = 1; d <= 3; d++) {
      const base = dayStart(today) + d * DAY
      for (const c of CLASSES) {
        writes.push(db.collection('schedules').add({
          data: {
            courseName: c.courseName, kind: 'group', coachId: openid, coachName,
            startAt: base + c.hour * HOUR, duration: c.duration, capacity: c.capacity,
            booked: 0, room: c.room, status: 'active', createdAt: now
          }
        }))
      }
    }
  }

  // ---------- 入场码密钥 ----------
  if (!(await getDoc('config', 'secret'))) {
    writes.push(db.collection('config').add({
      data: { _id: 'secret', value: crypto.randomBytes(32).toString('hex') }
    }))
  }

  await Promise.all(writes)

  // ---------- 哨兵：全部成功后才标记已初始化 ----------
  try {
    await db.collection('config').add({ data: { _id: 'system', initializedAt: now, by: openid } })
  } catch (e) {
    // 并发点两次时，另一边先写了哨兵
    fail('系统已经初始化过了')
  }
  return { initialized: true }
}

module.exports = { systemStatus, bootstrap, isInitialized }
