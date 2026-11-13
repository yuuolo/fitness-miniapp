// 自建后端入口：与云函数同款的 { action, data, code } → { code, msg, data } 协议
const fs = require('fs')
const path = require('path')
const https = require('https')
const express = require('express')

const { query, one, pool, ensureSchema } = require('./lib/db')
const { BizError, getMember } = require('./lib/common')

const PORT = Number(process.env.PORT || 3000)
const APPID = process.env.WX_APPID
const SECRET = process.env.WX_SECRET

// ---------- 登录：wx.login 的 code 换 openid（同一 code 5 分钟内复用）----------
const sessionCache = new Map()

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, res => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('上游返回不是 JSON'))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('上游超时'))
    })
  })
}

async function code2openid(code) {
  if (!code) fail('缺少登录 code')
  const hit = sessionCache.get(code)
  if (hit && hit.expire > Date.now()) return hit.openid
  const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + encodeURIComponent(APPID)
    + '&secret=' + encodeURIComponent(SECRET)
    + '&js_code=' + encodeURIComponent(code)
    + '&grant_type=authorization_code'
  const r = await getJson(url)
  if (!r.openid) fail('登录失败：' + (r.errmsg || '未知错误'))
  sessionCache.set(code, { openid: r.openid, expire: Date.now() + 5 * 60e3 })
  if (sessionCache.size > 5000) sessionCache.clear()
  return r.openid
}

function fail(msg) {
  throw new BizError(msg)
}

// ---------- 仅测试可用：带令牌的本地登录通道 ----------
// 生产环境不设置 DEV_LOGIN_TOKEN 时这段代码完全不生效；
// 测试时用 code='dev:<openid>' + 请求头 x-dev-token 绕过微信换取 openid。
const DEV_LOGIN_TOKEN = process.env.DEV_LOGIN_TOKEN

function devLogin(req, code) {
  if (!DEV_LOGIN_TOKEN) return null
  if (req.get('x-dev-token') !== DEV_LOGIN_TOKEN) return null
  const value = String(code || '')
  return value.startsWith('dev:') ? value.slice(4) : null
}

function resolveOpenid(req, code) {
  const dev = devLogin(req, code)
  return dev ? Promise.resolve(dev) : code2openid(code)
}

// 首次调用自动建会员档案
async function ensureMember(openid) {
  const existing = await getMember(openid)
  if (existing) return existing
  await query(
    'insert into members (openid, created_at) values ($1, $2) on conflict (openid) do nothing',
    [openid, Date.now()]
  )
  return getMember(openid)
}

// ---------- action 路由 ----------
// 这些导出是内部工具/纯函数，不是可调用 action
const INTERNAL_EXPORTS = new Set([
  'LIFTS', 'bmiOf', 'oneRM', 'scoreBody', 'publicMe', 'isInitialized',
  'markNoShows', 'remindClasses', 'remindExpiringCards'
])
const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment']
const handlers = {}
for (const name of MODULES) {
  const file = path.join(__dirname, 'lib', name + '.js')
  if (!fs.existsSync(file)) {
    console.warn('action module not installed yet:', name)
    continue
  }
  const mod = require(file)
  for (const [key, value] of Object.entries(mod)) {
    if (INTERNAL_EXPORTS.has(key)) continue
    if (typeof value !== 'function') continue
    handlers[key] = value
  }
}
console.log('actions (' + Object.keys(handlers).length + '):', Object.keys(handlers).sort().join(', '))

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/health', (req, res) => res.json({ ok: true }))

// ---------- 上传：小程序读成 ArrayBuffer 直接 POST 二进制，避免引入 multipart 依赖 ----------
const UPLOAD_LIMIT = 12 * 1024 * 1024
const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime'
}

app.post('/api/upload', express.raw({ type: () => true, limit: UPLOAD_LIMIT }), async (req, res) => {
  try {
    const ext = String(req.query.ext || '').replace(/^\./, '').toLowerCase()
    const mime = MIME_BY_EXT[ext]
    if (!mime) return res.json({ code: 400, msg: '不支持的文件类型' })
    const openid = await resolveOpenid(req, req.query.code)
    const bytes = Buffer.isBuffer(req.body) ? req.body : null
    if (!bytes || !bytes.length) return res.json({ code: 400, msg: '没有收到文件内容' })
    if (bytes.length > UPLOAD_LIMIT) return res.json({ code: 400, msg: '文件超过 12MB' })

    const id = require('crypto').randomBytes(16).toString('hex')
    await query('insert into media (id, mime, bytes, created_at) values ($1, $2, $3, $4)',
      [id, mime, bytes, Date.now()])
    await ensureMember(openid)
    const base = process.env.PUBLIC_BASE_URL || 'https://gym.novrein.com'
    res.json({ code: 0, data: { fileID: base + '/api/media/' + id, bytes: bytes.length, mime } })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error('upload failed', e)
    res.json({ code: 500, msg: '上传失败' })
  }
})

// 自建存储的静态图片（比如分享海报用的小程序码）
app.get('/api/media/:id', async (req, res) => {
  try {
    const { rows } = await query('select mime, bytes from media where id = $1', [req.params.id])
    if (!rows.length) return res.status(404).end()
    res.setHeader('content-type', rows[0].mime || 'application/octet-stream')
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    res.end(rows[0].bytes)
  } catch (e) {
    console.error('media read failed', e)
    res.status(500).end()
  }
})

app.post('/api', async (req, res) => {
  const { action, data, code } = req.body || {}
  try {
    const fn = Object.prototype.hasOwnProperty.call(handlers, action) && typeof handlers[action] === 'function'
      ? handlers[action]
      : null
    if (!fn) return res.json({ code: 404, msg: '未知操作' })
    const openid = await resolveOpenid(req, code)
    const me = await ensureMember(openid)
    const result = await fn({ openid, me, data: data || {} })
    res.json({ code: 0, data: result === undefined ? null : result })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error(action, e)
    res.json({ code: 500, msg: '服务器开小差了' })
  }
})

// 内部定时任务：每 15 分钟跑一次（等价云开发定时触发器）
function startCron() {
  const file = path.join(__dirname, 'lib', 'cron.js')
  if (!fs.existsSync(file)) return
  const { runCron } = require(file)
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await runCron(Date.now())
      console.log('cron', new Date().toISOString(), JSON.stringify(result))
    } catch (e) {
      console.error('cron failed', e)
    } finally {
      running = false
    }
  }
  setInterval(tick, 15 * 60e3)
  setTimeout(tick, 30e3)
  console.log('cron scheduler started (every 15 min)')
}

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log('listening on ' + PORT))
    startCron()
  })
  .catch(err => {
    console.error('schema init failed', err)
    process.exit(1)
  })

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log('shutting down', signal)
    pool.end().finally(() => process.exit(0))
  })
}
