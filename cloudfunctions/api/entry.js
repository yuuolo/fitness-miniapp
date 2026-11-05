const crypto = require('crypto')
const QRCode = require('qrcode')
const {
  db, _, cnDate, fail, need, getDoc, pickEntryCard, memberLabel, addPoints, addCardLog
} = require('./common')

const CODE_PREFIX = 'FE1'
const CODE_TTL = 60e3
const ENTRY_POINTS = 10

let secretCache = ''
async function getSecret() {
  if (!secretCache) {
    const doc = await getDoc('config', 'secret')
    if (!doc) fail('系统未初始化')
    secretCache = doc.value
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
  const cards = (await db.collection('member_cards').where({ openid, status: 'active' }).get()).data
  const card = pickEntryCard(cards, now)
  if (!card) fail('没有可入场的会员卡，请到前台办理')
  const secret = await getSecret()
  const code = [CODE_PREFIX, openid, now, sign(secret, openid, now)].join('.')
  const image = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 1, width: 480 })
  return { image, ttl: CODE_TTL, cardName: card.name, kind: card.kind, remainTimes: card.remainTimes, expireAt: card.expireAt }
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
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    fail('入场码无效')
  }
  if (!(ts <= now + 30e3 && now - ts <= CODE_TTL)) fail('入场码已过期，请会员刷新')

  const member = await getDoc('members', openid)
  if (!member) fail('会员不存在')
  const cards = (await db.collection('member_cards').where({ openid, status: 'active' }).get()).data
  const card = pickEntryCard(cards, now)
  const base = { name: memberLabel(member), phone: member.phone }
  if (!card) {
    await db.collection('entry_logs').add({ data: { openid, date: cnDate(now), result: 'denied', reason: '无可用会员卡', operator: me._id, createdAt: now } })
    fail(base.name + '：没有可用的会员卡')
  }

  const today = cnDate(now)
  const enteredToday = (await db.collection('entry_logs').where({ openid, date: today, result: 'ok' }).count()).total > 0
  let remainTimes = card.remainTimes
  let message = '欢迎光临'
  if (!enteredToday) {
    if (card.kind === 'times') {
      const res = await db.collection('member_cards').where({ _id: card._id, remainTimes: _.gt(0) })
        .update({ data: { remainTimes: _.inc(-1) } })
      if (!res.stats || res.stats.updated !== 1) fail('扣次失败，请重试')
      remainTimes -= 1
      await addCardLog(card, -1, '入场扣次', me._id)
      message = '已扣 1 次'
    }
    await addPoints(openid, ENTRY_POINTS, '到店打卡')
  } else {
    message = '今日已入场，不重复扣次'
  }
  await db.collection('entry_logs').add({
    data: { openid, date: today, result: 'ok', cardId: card._id, cardName: card.name, operator: me._id, createdAt: now }
  })
  return Object.assign(base, { cardName: card.name, kind: card.kind, remainTimes, expireAt: card.expireAt, message })
}

module.exports = { entryCode, verifyEntry }
