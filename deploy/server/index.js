// 自建后端骨架：与云函数同款 { action, data } 协议
// 已实现登录换 openid、ping、bodyTrend、saveBodyRecord；其余按同样格式往里加
const express = require('express')
const https = require('https')
const { Pool } = require('pg')

const PORT = Number(process.env.PORT || 3000)
const APPID = process.env.WX_APPID
const SECRET = process.env.WX_SECRET
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

class BizError extends Error {}
function fail(msg) {
  throw new BizError(msg)
}

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

// wx.login 的 code 换 openid。同一 code 5 分钟内复用，避免重复请求微信接口
const sessionCache = new Map()

async function code2openid(code) {
  if (!code) fail('缺少登录 code')
  const hit = sessionCache.get(code)
  if (hit && hit.expire > Date.now()) return hit.openid
  const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + APPID +
    '&secret=' + SECRET +
    '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code'
  const r = await getJson(url)
  if (!r.openid) fail('登录失败：' + (r.errmsg || '未知错误'))
  sessionCache.set(code, { openid: r.openid, expire: Date.now() + 5 * 60e3 })
  // 首次登录自动建档
  await pool.query(
    'insert into members (openid) values ($1) on conflict (openid) do nothing',
    [r.openid]
  )
  return r.openid
}

const handlers = {
  async ping() {
    return { ok: true, time: Date.now() }
  },

  // 对应云开发的 bodyTrend
  async bodyTrend({ openid, data }) {
    const days = Math.min(Math.max(Number(data.days) || 30, 7), 365)
    const { rows } = await pool.query(
      `select date, weight, body_fat, muscle, visceral, bmi, score, measured_at
         from body_records
        where openid = $1 and measured_at >= now() - ($2 || ' days')::interval
        order by measured_at asc
        limit 200`,
      [openid, String(days)]
    )
    return { days, count: rows.length, points: rows }
  },

  // 对应云开发的 saveBodyRecord
  async saveBodyRecord({ openid, data }) {
    const weight = Number(data.weight)
    if (!Number.isFinite(weight) || weight < 20 || weight > 300) fail('体重需在 20–300 之间')
    const { rows } = await pool.query(
      `insert into body_records
         (openid, date, weight, height, body_fat, muscle, visceral, bmi, score)
       values ($1, coalesce($2, current_date), $3, $4, $5, $6, $7, $8, $9)
       returning id, date, weight, bmi, score`,
      [
        openid,
        data.date || null,
        weight,
        data.height || null,
        data.bodyFat || null,
        data.muscle || null,
        data.visceral || null,
        data.bmi || null,
        data.score || null
      ]
    )
    return rows[0]
  }
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.post('/api', async (req, res) => {
  const { action, data, code } = req.body || {}
  try {
    const fn = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : null
    if (typeof fn !== 'function') return res.json({ code: 404, msg: '未知操作' })
    const openid = await code2openid(code)
    const result = await fn({ openid, data: data || {} })
    res.json({ code: 0, data: result === undefined ? null : result })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error(action, e)
    res.json({ code: 500, msg: '服务器开小差了' })
  }
})

app.get('/health', async (req, res) => {
  try {
    await pool.query('select 1')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.listen(PORT, () => console.log('listening on ' + PORT))
