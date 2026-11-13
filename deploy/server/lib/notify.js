// 微信订阅消息：access_token 缓存 + subscribeMessage.send，失败只记日志不影响业务
const https = require('https')
const templates = require('./templates')

const APPID = process.env.WX_APPID
const SECRET = process.env.WX_SECRET

let token = { value: '', expireAt: 0 }

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (e) {
          reject(new Error('上游返回不是 JSON'))
        }
      })
    })
    req.setTimeout(8000, () => req.destroy(new Error('上游超时')))
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

async function accessToken() {
  if (token.value && token.expireAt > Date.now() + 60e3) return token.value
  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential'
    + '&appid=' + encodeURIComponent(APPID) + '&secret=' + encodeURIComponent(SECRET)
  const r = await request(url, { method: 'GET' })
  if (!r.access_token) throw new Error(r.errmsg || '获取 access_token 失败')
  token = { value: r.access_token, expireAt: Date.now() + (r.expires_in || 7200) * 1000 }
  return token.value
}

// 订阅消息字段长度限制：thing 类最多 20 字，character_string 最多 32 位，time 不能截断
function wrap(fields) {
  const data = {}
  Object.keys(fields || {}).forEach(k => {
    const limit = k.indexOf('thing') === 0 ? 20 : 32
    const raw = fields[k] === undefined || fields[k] === null ? '' : String(fields[k])
    data[k] = { value: raw.slice(0, limit) }
  })
  return data
}

async function notify(kind, openid, values) {
  const t = templates[kind]
  if (!t || !t.id) return false
  try {
    const at = await accessToken()
    const body = JSON.stringify({
      touser: openid,
      template_id: t.id,
      page: t.page,
      miniprogram_state: templates.miniprogramState,
      lang: 'zh_CN',
      data: wrap(t.fields(values))
    })
    const r = await request(
      'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(at),
      { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      body
    )
    if (r.errcode) {
      console.warn('subscribeMessage.send failed', kind, r.errcode, r.errmsg)
      return false
    }
    return true
  } catch (e) {
    console.warn('subscribeMessage.send failed', kind, e.message)
    return false
  }
}

module.exports = { notify, accessToken }
