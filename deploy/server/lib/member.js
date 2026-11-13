// 会员：首页、资料、我的卡、积分
const { query } = require('./db')
const {
  DAY, cnDate, dayStart, fail, need, cardUsable,
  cardRow, cardTypeRow, bookingRow, pointsLogRow
} = require('./common')
const { isInitialized } = require('./system')

function publicMe(me) {
  if (!me) return null
  return {
    nickName: me.nickName,
    phone: me.phone,
    role: me.role,
    points: me.points || 0,
    blockUntil: me.blockUntil || 0,
    avatar: me.avatar || '',
    // 前端用来提示「资料还没填完」
    profileReady: !!(me.nickName && me.phone)
  }
}

async function home({ openid, me }) {
  const initialized = await isInitialized()
  if (!initialized || !me) return { initialized: false, me: publicMe(me), cards: [], todayBookings: [] }
  const now = Date.now()
  const cards = (await query(
    `select * from member_cards where openid = $1 and status in ('active', 'paused')
     order by created_at desc limit 20`, [openid]
  )).rows.map(cardRow)
  const from = dayStart(cnDate(now))
  const todayBookings = (await query(
    `select * from bookings where openid = $1 and status = 'booked'
     and start_at >= $2 and start_at < $3 order by start_at asc`,
    [openid, from, from + DAY]
  )).rows
  return {
    initialized,
    me: publicMe(me),
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    todayBookings: todayBookings.map(bookingRow)
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
  if (data.avatar !== undefined) {
    const a = String(data.avatar || '')
    // 云开发时代是 cloud:// 文件 ID；自建后端之后是 https:// 图片地址
    if (a && !/^(cloud:\/\/|https:\/\/)/.test(a)) fail('头像地址不正确，请重新选择')
    patch.avatar = a
  }
  if (!Object.keys(patch).length) fail('没有要修改的内容')

  const sets = []
  const values = [openid]
  const map = { nickName: 'nick_name', phone: 'phone', avatar: 'avatar' }
  for (const [k, v] of Object.entries(patch)) {
    values.push(v)
    sets.push(map[k] + ' = $' + values.length)
  }
  await query(`update members set ${sets.join(', ')} where openid = $1`, values)
  return publicMe(Object.assign({}, me, patch))
}

async function myCards({ openid, me }) {
  need(me, 'member')
  const now = Date.now()
  const cards = (await query(
    'select * from member_cards where openid = $1 order by created_at desc limit 50', [openid]
  )).rows.map(cardRow)
  const types = (await query(
    'select * from card_types where on_sale = true order by price asc'
  )).rows.map(cardTypeRow)
  return {
    cards: cards.map(c => Object.assign(c, { usable: cardUsable(c, now) })),
    types: types.map(t => Object.assign({ _id: t._id }, t))
  }
}

async function myPoints({ openid, me }) {
  need(me, 'member')
  const logs = (await query(
    'select * from points_logs where openid = $1 order by created_at desc limit 30', [openid]
  )).rows.map(pointsLogRow)
  return { points: me.points || 0, logs }
}

module.exports = { home, updateProfile, myCards, myPoints, publicMe }
