// 自建后端入口：与云函数同款的 { action, data, code } → { code, msg, data } 协议
const fs = require('fs')
const path = require('path')
const https = require('https')
const express = require('express')

const { query, one, pool, ensureSchema } = require('./lib/db')
const { BizError, getMember } = require('./lib/common')
const storage = require('./lib/storage')
const limits = require('./lib/limits')
const video = require('./lib/video')
const { receiveToFile } = require('./lib/receive')
const manage = require('./lib/manage')
const features = require('./lib/features')
const backup = require('./lib/backup')
const liftItems = require('./lib/lift-items')
const layout = require('./lib/layout')

// 管理页没有微信登录态，用一个虚拟管理员身份调用需要权限的模块函数
const ADMIN_ME = { _id: 'admin-page', openid: 'admin-page', role: 'admin', nickName: '管理页', phone: '' }

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
  'markNoShows', 'remindClasses', 'remindExpiringCards', 'statusOf'
])
const MODULES = ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge', 'subscriptions']
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

// ---------- 功能开关：action → 所属模块 ----------
// 关闭模块后，这些 action 统一返回「功能暂未开放」，防止旧链接/缓存页面绕过界面隐藏。
const ACTION_FEATURE = {
  // 团课与私教
  // 娱乐项目
  // 健身友圈
  momentList: 'moments',
  postMoment: 'moments',
  momentDetail: 'moments',
  deleteMoment: 'moments',
  likeMoment: 'moments',
  momentPoster: 'poster',
  momentByShort: 'moments',
  setPosterQr: 'moments',
  // 健身数据
  saveBodyRecord: 'fitness',
  deleteBodyRecord: 'fitness',
  saveStrength: 'fitness',
  saveActivity: 'fitness',
  deleteActivity: 'fitness',
  deleteStrength: 'fitness',
  importActivity: 'fitness',
  myFitness: 'fitness',
  memberFitness: 'fitness',
  memberProfile: 'fitness',
  bodyTrend: 'fitness',
  parseBodyReport: 'fitness',
  ocrBodyReport: 'fitness',
  // 会员挑战（裁判制）
  createChallenge: 'rank',
  pickReferee: 'rank',
  respondChallenge: 'rank',
  refereeRespond: 'rank',
  submitChallengeVideo: 'rank',
  judgeChallenge: 'rank',
  challengeList: 'rank',
  challengeDetail: 'rank',
  challengeSummary: 'rank',
  refereeOptions: 'rank',
  commentChallenge: 'rank',
  deleteChallengeComment: 'rank',
  likeChallengeComment: 'rank',
  challengeBoard: 'rank',
  notifyTemplates: 'rank',
  notifyTopicTemplates: 'rank',
  subscribeTopic: 'rank',
  mySubscriptions: 'rank',
  clearSubscription: 'rank',
  // 排行榜与竞赛
  leaderboard: 'rank',
  listLiftItems: 'rank',
  saveLiftItem: 'rank',
  setLiftItemEnabled: 'rank',
  deleteLiftItem: 'rank',
  competitionList: 'rank',
  competitionDetail: 'rank',
  saveCompetition: 'rank',
  setCompetitionStatus: 'rank',
  recordCompetitionEntry: 'rank',
  competitionEntries: 'rank',
  deleteCompetitionEntry: 'rank',
  myCompetitions: 'rank',
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/health', (req, res) => res.json({ ok: true }))

// ---------- 上传：小程序读成 ArrayBuffer 直接 POST 二进制，避免引入 multipart 依赖 ----------
const UPLOAD_LIMIT = 64 * 1024 * 1024 // express 的硬上限，真正的限制按管理页配置判断
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
    if (bytes.length > UPLOAD_LIMIT) return res.json({ code: 400, msg: '文件超过 64MB' })

    // 管理页配置的上传限制：视频按「压缩后上限」，图片按合计上限
    const kind = String(req.query.kind || '').toLowerCase()
    const cfg = limits.bytesOf(await limits.get())
    if (mime.indexOf('video/') === 0 || kind === 'video') {
      if (bytes.length > cfg.maxVideoBytes) {
        return res.json({
          code: 400,
          msg: '视频约 ' + (bytes.length / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxVideoMB + 'MB 上限'
        })
      }
    } else if (bytes.length > cfg.maxTotalBytes) {
      return res.json({
        code: 400,
        msg: '图片约 ' + (bytes.length / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxTotalMB + 'MB 上限'
      })
    }

    // 存储位置由管理页配置：数据库 / 腾讯云 COS / 阿里云 OSS
    const saved = await storage.put(bytes, { ext, mime })
    await ensureMember(openid)
    res.json({
      code: 0,
      data: { fileID: saved.url, bytes: bytes.length, mime, storage: saved.driver }
    })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error('upload failed', e)
    res.json({ code: 500, msg: '上传失败' })
  }
})

// ---------- 视频上传：超过「视频最长秒数」自动裁切，并把裁切情况返回给上传者 ----------
// 小程序用 wx.uploadFile（multipart）传原视频，这里落盘 → ffprobe 探测 → 超时长用 ffmpeg 裁
app.post('/api/video', async (req, res) => {
  const ext = String(req.query.ext || 'mp4').replace(/^\./, '').toLowerCase()
  const mime = MIME_BY_EXT[ext]
  let tmp = ''
  let outPath = ''
  try {
    if (!mime || mime.indexOf('video/') !== 0) return res.json({ code: 400, msg: '只支持视频文件' })
    const openid = await resolveOpenid(req, req.query.code)
    const cfg = await limits.get()
    if (!(await video.available())) return res.json({ code: 500, msg: '服务器未安装 ffmpeg，无法处理视频' })

    // 0 = 不限，但仍留一个物理安全上限（防止把磁盘塞满）
    const SAFETY_MAX = 1024 * 1024 * 1024
    const maxRaw = cfg.maxRawVideoMB > 0 ? cfg.maxRawVideoMB * 1024 * 1024 : SAFETY_MAX
    // 客户端有 Content-Length 时先拦一道，别让用户白传几十兆
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > maxRaw + 1024 * 1024) {
      req.resume()
      return res.json({
        code: 400,
        msg: cfg.maxRawVideoMB > 0
          ? '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxRawVideoMB +
            'MB 上限，无法自动裁切，请到相册里裁剪后再发'
          : '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过单次上传的物理上限（1GB）'
      })
    }
    tmp = video.tmpFile(ext)
    const got = await receiveToFile(req, { filePath: tmp, maxBytes: maxRaw + 1024 * 1024 })
    if (!got.bytes) return res.json({ code: 400, msg: '没有收到视频内容' })

    // 超时长就裁切（只保留前 maxDuration 秒）
    const prepared = await video.prepare(tmp, {
      maxDuration: cfg.maxDuration,
      ext,
      maxHeight: 720,
      maxBytes: maxRaw,
      // 裁切后还要满足「单视频体积上限」，否则发不出去；0 = 不限
      maxVideoBytes: cfg.maxVideoMB > 0
        ? Math.min(cfg.maxVideoMB, cfg.maxTotalMB > 0 ? cfg.maxTotalMB : cfg.maxVideoMB) * 1024 * 1024
        : 0
    })
    outPath = prepared.path

    const bytes = await fs.promises.readFile(outPath)
    const saved = await storage.put(bytes, { ext, mime })
    await ensureMember(openid)

    res.json({
      code: 0,
      data: {
        fileID: saved.url,
        bytes: bytes.length,
        mime,
        storage: saved.driver,
        duration: prepared.after.duration,
        originalDuration: prepared.before.duration,
        trimmed: prepared.trimmed,
        keptSeconds: prepared.trimmed ? cfg.maxDuration : null,
        unlimited: {
          duration: !(cfg.maxDuration > 0),
          videoMB: !(cfg.maxVideoMB > 0),
          rawMB: !(cfg.maxRawVideoMB > 0)
        },
        method: prepared.method
      }
    })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    // 体积/时长不合格属于用户侧问题，给 400 和可直接照做的提示
    if (/超过上限|超过.*上限|没有收到/.test(String(e.message || ''))) {
      return res.json({ code: 400, msg: String(e.message).replace('文件超过上限', '原视频超过 ' + (await limits.get()).maxRawVideoMB + 'MB 上限，请裁剪后再发') })
    }
    console.error('video upload failed', e)
    res.json({ code: 500, msg: '视频处理失败：' + (e.message || '未知错误') })
  } finally {
    for (const f of [tmp, outPath]) {
      if (f) fs.promises.rm(f, { force: true }).catch(() => {})
    }
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

// ---------- 服务器管理页 ----------
app.get('/favicon.ico', (req, res) => res.status(204).end())

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
})

function requireAdmin(req, res, next) {
  if (!manage.enabled()) {
    return res.status(503).json({ code: 503, msg: '未配置 ADMIN_PASSWORD，管理入口已关闭' })
  }
  if (!manage.verify(req.get('x-admin-token'))) {
    return res.status(401).json({ code: 401, msg: '请先登录' })
  }
  next()
}

app.post('/api/admin/login', async (req, res) => {
  try {
    const ip = req.socket.remoteAddress || 'unknown'
    const result = manage.login((req.body || {}).password, ip)
    res.json({ code: 0, data: result })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.get('/api/admin/status', requireAdmin, async (req, res) => {
  try {
    const [status, storageStats] = await Promise.all([manage.status(), storage.stats()])
    res.json({ code: 0, data: Object.assign({}, status, { storage: storageStats }) })
  } catch (e) {
    console.error('admin status failed', e)
    res.json({ code: 500, msg: '读取状态失败' })
  }
})

app.get('/api/admin/storage', requireAdmin, async (req, res) => {
  try {
    res.json({ code: 0, data: await storage.getPublicConfig() })
  } catch (e) {
    console.error('admin storage read failed', e)
    res.json({ code: 500, msg: '读取存储配置失败' })
  }
})

app.put('/api/admin/storage', requireAdmin, async (req, res) => {
  try {
    const cfg = await storage.saveConfig(req.body || {}, 'admin')
    console.log('storage config changed ->', cfg.driver)
    res.json({ code: 0, data: cfg })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api/admin/storage/test', requireAdmin, async (req, res) => {
  try {
    const result = await storage.testConfig(req.body || {})
    res.json({ code: 0, data: result })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

// 数据库备份：查看最近一次 + 立即备份一次
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  try {
    res.json({ code: 0, data: { latest: backup.latest(), dir: backup.DIR } })
  } catch (e) {
    res.json({ code: 500, msg: e.message })
  }
})

app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  try {
    const one = await backup.dump()
    res.json({ code: 0, data: one })
  } catch (e) {
    console.error('backup failed', e)
    res.json({ code: 500, msg: '备份失败：' + e.message })
  }
})

app.get('/api/admin/features', requireAdmin, async (req, res) => {
  try {
    res.json({ code: 0, data: await features.describe() })
  } catch (e) {
    console.error('admin features read failed', e)
    res.json({ code: 500, msg: '读取功能开关失败' })
  }
})

app.put('/api/admin/features', requireAdmin, async (req, res) => {
  try {
    const patch = (req.body && req.body.state) || {}
    await features.set(patch, 'admin')
    const data = await features.describe()
    const off = data.features.filter(f => !f.enabled).map(f => f.name)
    console.log('features changed ->', JSON.stringify(data.state))
    res.json({ code: 0, data: Object.assign({}, data, { summary: off.length ? '已关闭：' + off.join('、') : '全部功能已开启' }) })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

// ---------- 运动记录管理（管理页） ----------
app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim()
    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const type = String(req.query.type || '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
    const where = []
    const args = []
    if (from) { args.push(from); where.push('a.date >= $' + args.length) }
    if (to) { args.push(to); where.push('a.date <= $' + args.length) }
    if (type) { args.push(type); where.push('a.type = $' + args.length) }
    if (keyword) {
      args.push('%' + keyword + '%')
      where.push('(m.nick_name ilike $' + args.length + ' or m.phone ilike $' + args.length +
        ' or a.openid ilike $' + args.length + ')')
    }
    const cond = where.length ? ' where ' + where.join(' and ') : ''
    const selectArgs = args.concat([limit])
    const sql = 'select a.*, m.nick_name, m.phone from activity_records a ' +
      'left join members m on m.openid = a.openid' + cond +
      ' order by a.date desc, a.created_at desc limit $' + selectArgs.length
    const rows = (await query(sql, selectArgs)).rows.map(r => ({
      id: r.id,
      openid: r.openid,
      name: r.nick_name || r.phone || String(r.openid || '').slice(0, 8),
      date: r.date,
      type: r.type,
      typeName: activityTypeName(r.type),
      steps: r.steps,
      distance: Number(r.distance) || 0,
      duration: r.duration,
      calories: r.calories,
      avgHr: r.avg_hr,
      source: r.source,
      operator: r.operator
    }))
    const countSql = 'select count(*)::int as n from activity_records a ' +
      'left join members m on m.openid = a.openid' + cond
    const total = (await query(countSql, args)).rows[0].n
    res.json({ code: 0, data: { rows, total, limit } })
  } catch (e) {
    console.error('admin activity list failed', e)
    res.json({ code: 500, msg: '读取运动记录失败' })
  }
})

app.delete('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const id = String((req.body && req.body.id) || req.query.id || '')
    if (!id) return res.json({ code: 400, msg: '缺少记录 ID' })
    const row = (await query('select date, type from activity_records where id = $1', [id])).rows[0]
    if (!row) return res.json({ code: 400, msg: '记录不存在或已删除' })
    await query('delete from activity_records where id = $1', [id])
    console.log('admin deleted activity', id)
    res.json({ code: 0, data: { id, date: row.date, type: row.type } })
  } catch (e) {
    console.error('admin activity delete failed', e)
    res.json({ code: 500, msg: '删除失败' })
  }
})

// 运动类型的显示名（管理页表格用）
function activityTypeName(key) {
  const names = {
    walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳',
    strength: '力量训练', class: '团课', other: '其他'
  }
  return names[key] || key
}

// ---------- 上传与展示限制 ----------
app.get('/api/admin/media-limits', requireAdmin, async (req, res) => {
  try {
    const value = await limits.get()
    res.json({ code: 0, data: { value, defaults: limits.DEFAULTS, ranges: limits.RANGES } })
  } catch (e) {
    console.error('media limits read failed', e)
    res.json({ code: 500, msg: '读取上传限制失败' })
  }
})

app.put('/api/admin/media-limits', requireAdmin, async (req, res) => {
  try {
    const value = await limits.save((req.body && req.body.value) || {}, 'admin')
    console.log('media limits changed ->', JSON.stringify(value))
    const say = (v, unit) => (v > 0 ? v + ' ' + unit : '不限')
    res.json({
      code: 0,
      data: {
        value,
        summary: '已保存：时长 ' + say(value.maxDuration, '秒') +
          ' / 成品体积 ' + say(value.maxVideoMB, 'MB') +
          ' / 原视频 ' + say(value.maxRawVideoMB, 'MB') +
          '，最多 ' + value.maxCount + ' 个，合计 ' + say(value.maxTotalMB, 'MB') +
          '，列表显示 ' + value.feedThumbs + ' 个'
      }
    })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

// ---------- 排行榜项目（管理页） ----------
app.get('/api/admin/lifts', requireAdmin, async (req, res) => {
  try {
    const items = await liftItems.list({ includeDisabled: true })
    // 带上「能不能删 / 为什么不能删」，管理页直接把原因显示出来
    const withFlags = []
    for (const item of items) {
      const check = await liftItems.canDelete(item)
      withFlags.push(Object.assign({}, item, {
        deletable: check.deletable,
        deleteHint: check.reason
      }))
    }
    res.json({
      code: 0,
      data: {
        items: withFlags,
        metrics: Object.entries(liftItems.METRICS).map(([key, v]) => ({ key, name: v.name, unit: v.unit }))
      }
    })
  } catch (e) {
    console.error('admin lifts read failed', e)
    res.json({ code: 500, msg: '读取排行榜项目失败' })
  }
})

app.post('/api/admin/lifts/restore', requireAdmin, async (req, res) => {
  try {
    const result = await liftItems.restoreDefaults({ me: ADMIN_ME })
    res.json({ code: 0, data: result })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api/admin/lifts', requireAdmin, async (req, res) => {
  try {
    const item = await liftItems.save({ me: ADMIN_ME, data: req.body || {} })
    res.json({ code: 0, data: item })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api/admin/lifts/toggle', requireAdmin, async (req, res) => {
  try {
    const item = await liftItems.setEnabled({ me: ADMIN_ME, data: req.body || {} })
    res.json({ code: 0, data: item })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api/admin/lifts/delete', requireAdmin, async (req, res) => {
  try {
    const result = await liftItems.remove({ me: ADMIN_ME, data: req.body || {} })
    res.json({ code: 0, data: result })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

// ---------- 首页布局（管理页） ----------
app.get('/api/admin/layout', requireAdmin, async (req, res) => {
  try {
    const current = await layout.get(true)
    res.json({
      code: 0,
      data: {
        roles: current.roles,
        updatedAt: current.updatedAt,
        updatedBy: current.updatedBy,
        meta: layout.describe()
      }
    })
  } catch (e) {
    console.error('admin layout read failed', e)
    res.json({ code: 500, msg: '读取首页布局失败' })
  }
})

app.post('/api/admin/layout', requireAdmin, async (req, res) => {
  try {
    const saved = await layout.save({ me: ADMIN_ME, data: req.body || {} })
    res.json({ code: 0, data: { roles: saved.roles, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

// 生成一个自定义入口模块（前端点「新增」时调用，不落库）
app.post('/api/admin/layout/link', requireAdmin, (req, res) => {
  try {
    const block = layout.makeLink(req.body || {})
    res.json({ code: 0, data: block })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api', async (req, res) => {
  const { action, data, code } = req.body || {}
  try {
    const fn = Object.prototype.hasOwnProperty.call(handlers, action) && typeof handlers[action] === 'function'
      ? handlers[action]
      : null
    if (!fn) return res.json({ code: 404, msg: '未知操作' })
    const featureKey = ACTION_FEATURE[action]
    if (featureKey) await features.assertEnabled(featureKey)
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
      manage.recordCron(result)
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

// 兜底错误处理：任何未捕获错误都返回 JSON，不把堆栈泄露给客户端
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || err.statusCode || 500
  if (status >= 400 && status < 500) {
    return res.status(status).json({ code: status, msg: '请求格式不正确' })
  }
  console.error('unhandled error', err)
  res.status(500).json({ code: 500, msg: '服务器开小差了' })
})

ensureSchema()
  .then(async () => {
    // 排行榜默认项目：表为空时写入五项（幂等，老库不动）
    try {
      await require('./lib/lift-items').ensureSeed()
    } catch (e) {
      console.error('lift items seed failed', e)
    }
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
