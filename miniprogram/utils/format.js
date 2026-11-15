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

// 角色只有三级：会员 / 教练 / 管理员（原「前台」已移除）
const ROLE_NAMES = { member: '会员', coach: '教练', admin: '管理员' }




module.exports = {
  pad, dateStr, hhmm, md, dateTime, fullDate, yuan, nextDays, ROLE_NAMES
}
