const crypto = require('crypto')
const { db, DAY, HOUR, cnDate, dayStart, fail, getDoc } = require('./common')

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

// 第一个调用者成为管理员，并写入示例卡种、娱乐项目和课程
async function bootstrap({ openid, me }) {
  // 云函数默认 3 秒超时，建表和示例数据都并发写入
  await Promise.all(COLLECTIONS.map(name => db.createCollection(name).catch(() => { /* 已存在 */ })))
  try {
    await db.collection('config').add({ data: { _id: 'system', initializedAt: Date.now(), by: openid } })
  } catch (e) {
    fail('系统已经初始化过了')
  }
  await db.collection('config').add({
    data: { _id: 'secret', value: crypto.randomBytes(32).toString('hex') }
  })

  const now = Date.now()
  if (me) {
    await db.collection('members').doc(openid).update({ data: { role: 'admin' } })
  } else {
    await db.collection('members').add({
      data: { _id: openid, nickName: '', phone: '', role: 'admin', points: 0, noShow: 0, blockUntil: 0, createdAt: now }
    })
  }

  const cardTypes = [
    { name: '月卡', kind: 'period', times: 0, days: 30, price: 29900, desc: '30 天内不限次入场，含全部团课' },
    { name: '年卡', kind: 'period', times: 0, days: 365, price: 238800, desc: '365 天不限次入场，含全部团课' },
    { name: '10 次卡', kind: 'times', times: 10, days: 180, price: 49900, desc: '每天首次入场扣 1 次，180 天有效' },
    { name: '私教 10 节', kind: 'lesson', times: 10, days: 180, price: 299000, desc: '一对一私教课 10 节，180 天有效' }
  ]
  const writes = cardTypes.map((t, i) =>
    db.collection('card_types').add({ data: Object.assign({ onSale: true, createdAt: now + i }, t) }))

  const venues = [
    { name: '攀岩墙', desc: '含装备与安全员', openHour: 10, closeHour: 22, capacity: 6, price: 6800 },
    { name: '蹦床乐园', desc: '每场 1 小时，需穿防滑袜', openHour: 10, closeHour: 21, capacity: 12, price: 5800 },
    { name: '台球桌', desc: '中式八球，每桌最多 4 人', openHour: 12, closeHour: 24, capacity: 1, price: 4000 },
    { name: 'KTV 包间', desc: '小包 2–6 人', openHour: 14, closeHour: 24, capacity: 1, price: 8800 }
  ]
  venues.forEach((v, i) => writes.push(
    db.collection('venues').add({ data: Object.assign({ onSale: true, createdAt: now + i }, v) })))

  const coachName = me && me.nickName ? me.nickName : '管理员'
  const today = cnDate(now)
  const classes = [
    { courseName: '晨间瑜伽', hour: 9, duration: 60, capacity: 15, room: '瑜伽室' },
    { courseName: '动感单车', hour: 19, duration: 45, capacity: 20, room: '单车房' },
    { courseName: '燃脂搏击', hour: 20, duration: 60, capacity: 16, room: '综合训练区' }
  ]
  for (let d = 1; d <= 3; d++) {
    const base = dayStart(today) + d * DAY
    for (const c of classes) {
      writes.push(db.collection('schedules').add({
        data: {
          courseName: c.courseName, kind: 'group', coachId: openid, coachName,
          startAt: base + c.hour * HOUR, duration: c.duration, capacity: c.capacity,
          booked: 0, room: c.room, status: 'active', createdAt: now
        }
      }))
    }
  }
  await Promise.all(writes)
  return { initialized: true }
}

module.exports = { systemStatus, bootstrap, isInitialized }
