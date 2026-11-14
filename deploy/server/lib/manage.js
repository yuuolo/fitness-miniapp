// 服务器管理接口：登录鉴权、系统状态、存储配置
//
// 鉴权方式：ADMIN_PASSWORD（环境变量）→ POST /api/admin/login 换一个带签名的短期令牌，
// 之后每个管理请求带 x-admin-token。未配置 ADMIN_PASSWORD 时整个管理入口关闭。
const crypto = require('crypto')
const { query, one } = require('./db')
const { cnDate } = require('./common')

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const SECRET = process.env.CONFIG_SECRET || process.env.POSTGRES_PASSWORD || 'gym-admin-dev'
const TOKEN_KEY = crypto.createHash('sha256').update('gym-admin-token|' + ADMIN_PASSWORD + '|' + SECRET).digest()
const TOKEN_TTL = 12 * 3600e3

// 简单的登录失败限流：同一 IP 连续失败 8 次锁 10 分钟
const failures = new Map()
const MAX_FAILS = 8
const LOCK_MS = 10 * 60e3

let lastCron = null

function recordCron(result) {
  lastCron = { at: Date.now(), result }
}

function enabled() {
  return !!ADMIN_PASSWORD
}

function locked(ip) {
  const hit = failures.get(ip)
  if (!hit) return 0
  if (hit.until && hit.until > Date.now()) return Math.ceil((hit.until - Date.now()) / 1000)
  return 0
}

function noteFail(ip) {
  const hit = failures.get(ip) || { count: 0, until: 0 }
  hit.count += 1
  if (hit.count >= MAX_FAILS) {
    hit.until = Date.now() + LOCK_MS
    hit.count = 0
  }
  failures.set(ip, hit)
  if (failures.size > 2000) failures.clear()
}

function noteSuccess(ip) {
  failures.delete(ip)
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * 用密码换令牌。
 * @param {string} password 管理密码
 * @param {string} ip 客户端 IP（限流用）
 * @returns {{token:string, expiresAt:number}}
 */
function login(password, ip) {
  if (!enabled()) throw new Error('未配置 ADMIN_PASSWORD，管理入口已关闭')
  const wait = locked(ip)
  if (wait) throw new Error('尝试次数过多，请 ' + Math.ceil(wait / 60) + ' 分钟后再试')
  if (!safeEqual(password || '', ADMIN_PASSWORD)) {
    noteFail(ip)
    throw new Error('密码不正确')
  }
  noteSuccess(ip)
  const expiresAt = Date.now() + TOKEN_TTL
  const sig = crypto.createHmac('sha256', TOKEN_KEY).update(String(expiresAt)).digest('base64url')
  return { token: expiresAt + '.' + sig, expiresAt }
}

/**
 * 校验令牌。
 * @param {string} token 请求头里的令牌
 * @returns {boolean}
 */
function verify(token) {
  if (!enabled() || !token) return false
  const parts = String(token).split('.')
  if (parts.length !== 2) return false
  const expiresAt = Number(parts[0])
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false
  const expect = crypto.createHmac('sha256', TOKEN_KEY).update(String(expiresAt)).digest('base64url')
  return safeEqual(parts[1], expect)
}

async function counts() {
  const today = cnDate(Date.now())
  const row = await one(
    `select
       (select count(*)::int from members) as members,
       (select count(*)::int from member_cards where status = 'active') as active_cards,
       (select count(*)::int from bookings where status = 'booked') as pending_bookings,
       (select count(*)::int from schedules where status = 'active' and start_at > $1) as upcoming_schedules,
       (select count(*)::int from moments where status = 'normal') as moments,
       (select count(*)::int from entry_logs where date = $2 and result = 'ok') as today_entries`,
    [Date.now(), today]
  )
  return {
    members: row.members,
    activeCards: row.active_cards,
    pendingBookings: row.pending_bookings,
    upcomingSchedules: row.upcoming_schedules,
    moments: row.moments,
    todayEntries: row.today_entries
  }
}

/**
 * 管理页要展示的系统状态。
 * @returns {Promise<object>}
 */
async function status() {
  const mem = process.memoryUsage()
  return {
    now: Date.now(),
    server: {
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1048576),
      pid: process.pid
    },
    data: await counts(),
    config: {
      appid: process.env.WX_APPID || '',
      hasSecret: !!process.env.WX_SECRET,
      miniprogramState: process.env.WX_MP_STATE || 'developer',
      templates: {
        bookingSuccess: !!process.env.WX_TPL_BOOKING_SUCCESS,
        classReminder: !!process.env.WX_TPL_CLASS_REMINDER,
        cardExpire: !!process.env.WX_TPL_CARD_EXPIRE
      },
      shopAddress: process.env.SHOP_ADDRESS || '',
      publicBaseUrl: process.env.PUBLIC_BASE_URL || ''
    },
    cron: lastCron,
    adminEnabled: enabled()
  }
}

/** 记录一次定时任务结果（供状态页展示） */
module.exports = { enabled, login, verify, status, recordCron, counts, TOKEN_TTL }
