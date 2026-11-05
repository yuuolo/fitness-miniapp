const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const MIN = 60e3
const HOUR = 3600e3
const DAY = 864e5
const TZ_OFFSET = 8 * HOUR

// 云函数运行在 UTC，业务日期一律按北京时间计算
function cnDate(ms) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10)
}

function cnDateTime(ms) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 16).replace('T', ' ')
}

function cnHour(ms) {
  return new Date(ms + TZ_OFFSET).getUTCHours()
}

function dayStart(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) fail('日期格式不正确')
  return Date.parse(dateStr + 'T00:00:00+08:00')
}

class BizError extends Error {}

function fail(msg) {
  throw new BizError(msg)
}

const ROLE_LEVEL = { member: 0, coach: 1, staff: 2, admin: 3 }
const ROLE_NAMES = { member: '会员', coach: '教练', staff: '前台', admin: '管理员' }

function need(me, role) {
  if (!me) fail('请先登录')
  if ((ROLE_LEVEL[me.role] || 0) < ROLE_LEVEL[role]) fail('没有权限')
}

async function getDoc(coll, id) {
  try {
    const res = await db.collection(coll).doc(id).get()
    return res.data
  } catch (e) {
    return null
  }
}

async function txGet(tx, coll, id) {
  try {
    const res = await tx.collection(coll).doc(id).get()
    return res.data
  } catch (e) {
    return null
  }
}

function strip(doc) {
  const copy = Object.assign({}, doc)
  delete copy._id
  delete copy._openid
  return copy
}

function cardUsable(card, now) {
  if (!card || card.status !== 'active') return false
  if (card.expireAt && card.expireAt <= now) return false
  if (card.kind === 'period') return true
  return card.remainTimes > 0
}

// 入场优先用期限卡，其次次卡；私教课包不能入场
function pickEntryCard(cards, now) {
  const usable = cards.filter(c => cardUsable(c, now) && c.kind !== 'lesson')
  return usable.find(c => c.kind === 'period') || usable.find(c => c.kind === 'times') || null
}

function memberLabel(m) {
  return (m && (m.nickName || (m.phone ? '会员' + m.phone.slice(-4) : '未命名会员'))) || '未知会员'
}

async function addPoints(openid, change, source) {
  await db.collection('members').doc(openid).update({ data: { points: _.inc(change) } })
  await db.collection('points_logs').add({ data: { openid, change, source, createdAt: Date.now() } })
}

const NO_SHOW_LIMIT = 3
const BLOCK_DAYS = 7

// 累计缺席满 3 次，暂停预约 7 天并清零
async function recordNoShow(openid, now) {
  const member = await getDoc('members', openid)
  const noShow = ((member && member.noShow) || 0) + 1
  const patch = noShow >= NO_SHOW_LIMIT
    ? { noShow: 0, blockUntil: now + BLOCK_DAYS * DAY }
    : { noShow }
  await db.collection('members').doc(openid).update({ data: patch })
}

async function addCardLog(card, change, reason, operator) {
  await db.collection('card_logs').add({
    data: { cardId: card._id, openid: card.openid, change, reason, operator: operator || '', createdAt: Date.now() }
  })
}

module.exports = {
  cloud, db, _, MIN, HOUR, DAY, cnDate, cnDateTime, cnHour, dayStart, BizError, fail, need, ROLE_LEVEL, ROLE_NAMES,
  getDoc, txGet, strip, cardUsable, pickEntryCard, memberLabel, addPoints, addCardLog, recordNoShow
}
