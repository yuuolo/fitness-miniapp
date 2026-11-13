// 全 action 冒烟测试：用最小/空参数逐个调用，确保没有 500（即没有未处理的 TypeError）。
// 400（业务校验）是正常结果，500 则说明代码有 bug。
// 用法：BASE=http://gym-http-test:3000 DEV_LOGIN_TOKEN=xxx node test/smoke.js
const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment']
const INTERNAL = new Set([
  'LIFTS', 'bmiOf', 'oneRM', 'scoreBody', 'publicMe', 'isInitialized',
  'markNoShows', 'remindClasses', 'remindExpiringCards'
])

const BASE = (process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '')
const TOKEN = process.env.DEV_LOGIN_TOKEN || ''
const HEADERS = { 'content-type': 'application/json', 'x-dev-token': TOKEN }

function actionNames() {
  const names = []
  for (const name of MODULES) {
    const mod = require('../lib/' + name)
    for (const [key, value] of Object.entries(mod)) {
      if (INTERNAL.has(key)) continue
      if (typeof value !== 'function') continue
      names.push(key)
    }
  }
  return names.sort()
}

async function post(action, openid, data) {
  const res = await fetch(BASE + '/api', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action, data: data || {}, code: 'dev:' + openid })
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    /* 非 JSON 响应本身就是问题 */
  }
  return { status: res.status, json, text }
}

// 每个 action 给一组「合法形状但可能因缺数据而失败」的参数
const SAMPLE = {
  updateProfile: { nickName: '冒烟', phone: '13700001111' },
  openCard: { amount: 100, payMethod: 'cash' },
  adjustCard: { delta: 0 },
  setCardStatus: {},
  setRole: {},
  saveCardType: {},
  saveSchedule: {},
  cancelSchedule: {},
  roster: {},
  markAttendance: {},
  venueBookings: {},
  useVenueBooking: {},
  saveVenue: {},
  bookSchedule: {},
  cancelBooking: {},
  venueSlots: {},
  bookVenue: {},
  verifyEntry: {},
  saveBodyRecord: {},
  saveStrength: {},
  saveActivity: {},
  memberFitness: {},
  setBodyPublic: {},
  bodyTrend: {},
  leaderboard: {},
  postMoment: {},
  momentDetail: {},
  deleteMoment: {},
  likeMoment: {},
  momentPoster: {},
  momentByShort: {},
  setPosterQr: {},
  memberDetail: {},
  searchMembers: {},
  staffSchedules: {},
  listSchedules: {},
  momentList: {}
}

async function main() {
  const ADMIN = 'smoke-admin'
  const MEMBER = 'smoke-member'

  // 准备：初始化 + 把 MEMBER 拉成前台，尽量让权限校验通过，暴露更深层的问题
  await post('updateProfile', ADMIN, { nickName: '管理员', phone: '13700000001' })
  await post('bootstrap', ADMIN)
  await post('updateProfile', MEMBER, { nickName: '冒烟会员', phone: '13700000002' })
  await post('setRole', ADMIN, { openid: MEMBER, role: 'admin' })

  const names = actionNames()
  console.log('共 ' + names.length + ' 个 action\n')

  const bad = []
  const rows = []
  for (const action of names) {
    const data = Object.assign({ openid: MEMBER }, SAMPLE[action] || {})
    const r = await post(action, MEMBER, data)
    const code = r.json && typeof r.json.code === 'number' ? r.json.code : null
    let msg = '(非 JSON 响应)'
    if (r.json && typeof r.json.code === 'number') {
      msg = code === 0 ? '成功' : String(r.json.msg || '').slice(0, 34)
    }
    rows.push([action, r.status, code, msg])
    if (code === null || code === 500 || r.status >= 500) {
      bad.push({ action, status: r.status, code, msg, body: r.text.slice(0, 300) })
    }
  }

  const pad = s => String(s).padEnd(22)
  console.log(pad('action') + 'HTTP  code  msg')
  for (const [action, status, code, msg] of rows) {
    console.log(pad(action) + String(status).padEnd(6) + String(code).padEnd(6) + msg)
  }

  console.log('')
  if (bad.length) {
    console.log('存在问题的 action：')
    for (const b of bad) {
      console.log('  x ' + b.action + ' -> HTTP ' + b.status + ' code ' + b.code)
      console.log('    ' + b.body.replace(/\s+/g, ' '))
    }
    process.exit(1)
  }
  console.log('全部 ' + names.length + ' 个 action 均未出现 500 / 非 JSON 响应')
}

main().catch(err => {
  console.error('冒烟测试失败：', err)
  process.exit(1)
})
