// 切换「友圈海报」开关：node toggle-poster.js on|off
const https = require('https')
const http = require('http')

const BASE = process.env.ADMIN_URL || 'https://gym.novrein.com'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

function request(url, method, body, token) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const data = body === undefined ? null : JSON.stringify(body)
    const opts = {
      method,
      headers: { 'content-type': 'application/json' }
    }
    if (data) opts.headers['content-length'] = Buffer.byteLength(data)
    if (token) opts.headers['x-admin-token'] = token
    const req = lib.request(url, opts, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('返回不是 JSON: ' + raw.slice(0, 100))) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('超时')))
    if (data) req.write(data)
    req.end()
  })
}

;(async () => {
  const mode = process.argv[2]
  if (['on', 'off', 'show'].indexOf(mode) < 0) {
    console.log('用法: node toggle-poster.js on|off|show')
    process.exit(1)
  }
  const login = await request(BASE + '/api/admin/login', 'POST', { password: PASSWORD })
  const token = login.data && login.data.token
  if (!token) throw new Error('登录失败: ' + (login.msg || JSON.stringify(login)))

  const cur = await request(BASE + '/api/admin/features', 'GET', undefined, token)
  const state = (cur.data && cur.data.state) || {}
  if (mode === 'show') {
    console.log('当前开关: ' + JSON.stringify({
      moments: state.moments, poster: state.poster, fitness: state.fitness, rank: state.rank
    }))
    return
  }
  const want = mode === 'on'
  await request(BASE + '/api/admin/features', 'PUT', { state: { poster: want } }, token)
  const after = await request(BASE + '/api/admin/features', 'GET', undefined, token)
  console.log('  poster = ' + ((after.data && after.data.state) || {}).poster)
})().catch(e => {
  console.error('切换失败: ' + e.message)
  process.exit(1)
})
