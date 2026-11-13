// 入场码：HMAC 签名 + 60 秒有效；前台核验时按规则扣次/加积分
const crypto = require('crypto')
const QRCode = require('qrcode')
const { query, tx } = require('./db')
const {
  cnDate, fail, need, pickEntryCard, memberLabel, memberRow, cardRow,
  configGet, addPoints, addCardLog, newId
} = require('./common')

const CODE_PREFIX = 'FE1'
const CODE_TTL = 60e3
const ENTRY_POINTS = 10

let secretCache = ''
async function getSecret() {
  if (!secretCache) {
    const cfg = await configGet('secret')
    if (!cfg || !cfg.value) fail('系统未初始化')
    secretCache = cfg.value
  }
  return secretCache
}

function sign(secret, openid, ts) {
  return crypto.createHmac('sha256', secret).update(openid + '.' + ts).digest('hex').slice(0, 20)
}

// 入场码 = 前缀.openid.时间戳.签名，60 秒内有效，截图转发很快失效
async function entryCode({ openid, me }) {
  need(me, 'member')
  const now = Date.now()
  const cards = (await query(
    "select * from member_cards where openid = $1 and status = 'active'", [openid]
  )).rows.map(cardRow)
  const card = pickEntryCard(cards, now)
  if (!card) fail('没有可入场的会员卡，请到前台办理')
  const secret = await getSecret()
  const code = [CODE_PREFIX, openid, now, sign(secret, openid, now)].join('.')
  const image = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 1, width: 480 })
  return {
    image, ttl: CODE_TTL, cardName: card.name, kind: card.kind,
    remainTimes: card.remainTimes, expireAt: card.expireAt
  }
}

async function verifyEntry({ me, data }) {
  need(me, 'staff')
  const now = Date.now()
  const parts = String(data.code || '').split('.')
  if (parts.length !== 4 || parts[0] !== CODE_PREFIX) fail('不是本店的入场码')
  const [, openid, tsStr, sig] = parts
  const ts = Number(tsStr)
  const secret = await getSecret()
  const expected = sign(secret, openid, ts)
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) fail('入场码无效')
  if (!(ts <= now + 30e3 && now - ts <= CODE_TTL)) fail('入场码已过期，请会员刷新')

  const member = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  if (!member) fail('会员不存在')
  const cards = (await query(
    "select * from member_cards where openid = $1 and status = 'active'", [openid]
  )).rows.map(cardRow)
  const card = pickEntryCard(cards, now)
  const base = { name: memberLabel(member), phone: member.phone }

  if (!card) {
    await query(
      `insert into entry_logs (id, openid, date, result, reason, operator, created_at)
       values ($1, $2, $3, 'denied', '无可用会员卡', $4, $5)`,
      [newId(), openid, cnDate(now), me._id, now]
    )
    fail(base.name + '：没有可用的会员卡')
  }

  const today = cnDate(now)
  const enteredToday = (await query(
    "select count(*)::int as n from entry_logs where openid = $1 and date = $2 and result = 'ok'",
    [openid, today]
  )).rows[0].n > 0

  let remainTimes = card.remainTimes
  let message = '欢迎光临'
  await tx(async client => {
    if (!enteredToday) {
      if (card.kind === 'times') {
        const res = await client.query(
          'update member_cards set remain_times = remain_times - 1 where id = $1 and remain_times > 0 returning remain_times',
          [card._id]
        )
        if (res.rowCount !== 1) fail('扣次失败，请重试')
        remainTimes = res.rows[0].remain_times
        await addCardLog(client, card, -1, '入场扣次', me._id)
        message = '已扣 1 次'
      }
      await addPoints(client, openid, ENTRY_POINTS, '到店打卡')
    } else {
      message = '今日已入场，不重复扣次'
    }
    await client.query(
      `insert into entry_logs (id, openid, date, result, card_id, card_name, operator, created_at)
       values ($1, $2, $3, 'ok', $4, $5, $6, $7)`,
      [newId(), openid, today, card._id, card.name, me._id, now]
    )
  })

  return Object.assign(base, {
    cardName: card.name, kind: card.kind, remainTimes,
    expireAt: card.expireAt, message
  })
}

module.exports = { entryCode, verifyEntry }
