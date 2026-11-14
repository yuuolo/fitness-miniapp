// 会员：首页、资料、我的卡、积分
const https = require('https')
const { query } = require('./db')
const {
  DAY, cnDate, dayStart, fail, need, cardUsable,
  cardRow, cardTypeRow, bookingRow, pointsLogRow
} = require('./common')
const { isInitialized } = require('./system')
const features = require('./features')
const { accessToken } = require('./notify')

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

// 调微信接口（POST JSON）
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body || {}))
    const req = https.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': payload.length }
    }, res => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (e) {
          reject(new Error('微信接口返回异常'))
        }
      })
    })
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

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
  const [initialized, featureState] = await Promise.all([isInitialized(), features.get()])
  if (!initialized || !me) {
    return { initialized: false, me: publicMe(me), cards: [], todayBookings: [], features: featureState }
  }
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
    features: featureState,
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

// 一键获取手机号：小程序端 <button open-type="getPhoneNumber"> 拿到 code，
// 服务端用它换真实号码（需要小程序已认证，个人主体用不了，会返回错误码）。
async function bindPhone({ openid, me, data }) {
  need(me, 'member')
  const code = String(data.code || '').trim()
  if (!code) fail('缺少手机号授权 code')

  const at = await accessToken()
  const res = await postJson(
    'https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=' + encodeURIComponent(at),
    { code }
  )
  if (res.errcode) {
    // 常见：-6010 未认证主体 / 40029 code 无效 / 40001 token 失效
    const tips = {
      '-6010': '小程序未完成认证，无法一键获取手机号',
      40029: '授权已过期，请重试',
      40001: '服务端凭证失效，请稍后重试'
    }
    fail(tips[res.errcode] || ('获取手机号失败：' + (res.errmsg || res.errcode)))
  }
  const info = res.phone_info || {}
  const phone = String(info.purePhoneNumber || info.phoneNumber || '').replace(/^\+?86/, '')
  if (!/^1\d{10}$/.test(phone)) fail('获取到的手机号格式不正确')

  await query('update members set phone = $2 where openid = $1', [openid, phone])
  return publicMe(Object.assign({}, me, { phone }))
}

module.exports = { home, updateProfile, bindPhone, myCards, myPoints, publicMe }
