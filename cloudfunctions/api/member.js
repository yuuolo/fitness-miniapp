const { db, _, DAY, cnDate, dayStart, fail, need, cardUsable, strip } = require('./common')
const { isInitialized } = require('./system')

function publicMe(me) {
  if (!me) return null
  return {
    nickName: me.nickName, phone: me.phone, role: me.role, points: me.points || 0,
    blockUntil: me.blockUntil || 0
  }
}

async function home({ openid, me }) {
  const initialized = await isInitialized()
  if (!initialized || !me) return { initialized: false, me: publicMe(me), cards: [], todayBookings: [] }
  const now = Date.now()
  const cards = (await db.collection('member_cards').where({ openid, status: _.in(['active', 'paused']) })
    .orderBy('createdAt', 'desc').limit(20).get()).data
  const from = dayStart(cnDate(now))
  const todayBookings = (await db.collection('bookings')
    .where({ openid, status: 'booked', startAt: _.gte(from).and(_.lt(from + DAY)) })
    .orderBy('startAt', 'asc').get()).data
  return {
    initialized,
    me: publicMe(me),
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    todayBookings
  }
}

async function updateProfile({ openid, me, data }) {
  need(me, 'member')
  const patch = {}
  if (data.nickName !== undefined) {
    const n = String(data.nickName).trim()
    if (!n || n.length > 20) fail('昵称需为 1–20 个字')
    patch.nickName = n
  }
  if (data.phone !== undefined) {
    const p = String(data.phone).trim()
    if (!/^1\d{10}$/.test(p)) fail('请输入 11 位手机号')
    patch.phone = p
  }
  if (!Object.keys(patch).length) fail('没有要修改的内容')
  await db.collection('members').doc(openid).update({ data: patch })
  return publicMe(Object.assign({}, me, patch))
}

async function myCards({ openid, me }) {
  need(me, 'member')
  const now = Date.now()
  const cards = (await db.collection('member_cards').where({ openid })
    .orderBy('createdAt', 'desc').limit(50).get()).data
  const types = (await db.collection('card_types').where({ onSale: true }).orderBy('price', 'asc').get()).data
  return {
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    types: types.map(t => Object.assign({ _id: t._id }, strip(t)))
  }
}

async function myPoints({ openid, me }) {
  need(me, 'member')
  const logs = (await db.collection('points_logs').where({ openid })
    .orderBy('createdAt', 'desc').limit(30).get()).data
  return { points: me.points || 0, logs }
}

module.exports = { home, updateProfile, myCards, myPoints }
