const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function hhmm(ms) {
  const d = new Date(ms)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function md(ms) {
  const d = new Date(ms)
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function dateTime(ms) {
  return md(ms) + ' ' + hhmm(ms)
}

function fullDate(ms) {
  return ms ? dateStr(new Date(ms)) : ''
}

function yuan(fen) {
  const n = (fen || 0) / 100
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

// 从今天起的 n 天，用于日期切换条
function nextDays(n) {
  const list = []
  const base = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    list.push({
      date: dateStr(d),
      day: pad(d.getDate()),
      week: i === 0 ? '今天' : i === 1 ? '明天' : '周' + WEEK[d.getDay()]
    })
  }
  return list
}

const CARD_KINDS = { period: '期限卡', times: '次卡', lesson: '私教课包' }
const CARD_STATUS = { active: '正常', paused: '停卡中', void: '已作废' }
const BOOKING_STATUS = { booked: '已预约', attended: '已签到', absent: '缺席', cancelled: '已取消', used: '已核销' }
const ROLE_NAMES = { member: '会员', coach: '教练', staff: '前台', admin: '管理员' }

function cardSummary(card) {
  if (card.kind === 'period') return '有效期至 ' + fullDate(card.expireAt)
  return '剩余 ' + card.remainTimes + ' 次 · ' + fullDate(card.expireAt) + ' 到期'
}

function decorateCard(card) {
  const expired = card.expireAt && card.expireAt <= Date.now()
  return Object.assign(card, {
    kindName: CARD_KINDS[card.kind] || '',
    statusName: card.status === 'active' && expired ? '已过期' : (CARD_STATUS[card.status] || card.status),
    summary: cardSummary(card)
  })
}

function decorateBooking(b) {
  return Object.assign(b, {
    timeText: md(b.startAt) + ' ' + hhmm(b.startAt) + '-' + hhmm(b.endAt),
    statusName: BOOKING_STATUS[b.status] || b.status,
    typeName: b.type === 'venue' ? '娱乐' : (b.kind === 'private' ? '私教' : '团课')
  })
}

module.exports = {
  pad, dateStr, hhmm, md, dateTime, fullDate, yuan, nextDays,
  CARD_KINDS, CARD_STATUS, BOOKING_STATUS, ROLE_NAMES, decorateCard, decorateBooking
}
