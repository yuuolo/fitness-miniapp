// 系统初始化：第一个调用者成为管理员，写入示例卡种/娱乐项目/团课和入场码密钥
const crypto = require('crypto')
const { tx, query } = require('./db')
const { DAY, HOUR, cnDate, dayStart, fail, newId, configGet } = require('./common')

async function isInitialized() {
  return !!(await configGet('system'))
}

async function systemStatus() {
  return { initialized: await isInitialized() }
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

// 哨兵（config/system）最后写：中途失败不会被误标记为已初始化，重新点一次会续上
async function bootstrap({ openid, me }) {
  if (await isInitialized()) fail('系统已经初始化过了')

  const now = Date.now()
  await tx(async client => {
    await client.query(
      `insert into members (openid, role, created_at) values ($1, 'admin', $2)
       on conflict (openid) do update set role = 'admin'`,
      [openid, now]
    )

    const cards = await client.query('select count(*)::int as n from card_types')
    if (cards.rows[0].n === 0) {
      for (let i = 0; i < CARD_TYPES.length; i++) {
        const t = CARD_TYPES[i]
        await client.query(
          `insert into card_types (id, name, kind, times, days, price, descr, on_sale, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
          [newId(), t.name, t.kind, t.times, t.days, t.price, t.desc, now + i]
        )
      }
    }

    const venues = await client.query('select count(*)::int as n from venues')
    if (venues.rows[0].n === 0) {
      for (let i = 0; i < VENUES.length; i++) {
        const v = VENUES[i]
        await client.query(
          `insert into venues (id, name, descr, open_hour, close_hour, capacity, price, on_sale, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
          [newId(), v.name, v.desc, v.openHour, v.closeHour, v.capacity, v.price, now + i]
        )
      }
    }

    const schedules = await client.query('select count(*)::int as n from schedules')
    if (schedules.rows[0].n === 0) {
      const coachName = me && me.nickName ? me.nickName : '管理员'
      const today = cnDate(now)
      for (let d = 1; d <= 3; d++) {
        const base = dayStart(today) + d * DAY
        for (const c of CLASSES) {
          await client.query(
            `insert into schedules (id, course_name, kind, coach_id, coach_name, start_at,
               duration, capacity, booked, room, status, created_at)
             values ($1, $2, 'group', $3, $4, $5, $6, $7, 0, $8, 'active', $9)`,
            [newId(), c.courseName, openid, coachName, base + c.hour * HOUR,
              c.duration, c.capacity, c.room, now]
          )
        }
      }
    }

    const secret = await client.query('select 1 from config where key = $1', ['secret'])
    if (secret.rowCount === 0) {
      await client.query('insert into config (key, value) values ($1, $2)', [
        'secret', JSON.stringify({ value: crypto.randomBytes(32).toString('hex') })
      ])
    }

    const sentinel = await client.query(
      'insert into config (key, value) values ($1, $2) on conflict (key) do nothing',
      ['system', JSON.stringify({ initializedAt: now, by: openid })]
    )
    if (sentinel.rowCount === 0) fail('系统已经初始化过了')
  })

  return { initialized: true }
}

module.exports = { systemStatus, bootstrap, isInitialized }
