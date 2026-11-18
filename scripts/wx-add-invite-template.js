// 比赛邀请通知有 6 个字段，接口最多 5 个 → 用 5 个（去掉「比赛地点」）
const https = require('https')
const { accessToken } = require('/app/lib/notify')

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ''
    const req = https.request({
      host: 'api.weixin.qq.com',
      method,
      path: path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token),
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}
    }, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error(raw.slice(0, 300))) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

;(async () => {
  const token = await accessToken()
  const kids = [1, 2, 4, 5, 6] // 邀请人 / 比赛时间 / 比赛名称 / 参赛球队 / 比赛场地
  const r = await request('POST', '/wxaapi/newtmpl/addtemplate', {
    tid: '6841', kidList: kids, sceneDesc: '发起挑战/指派裁判时通知对方'
  }, token)
  if (r.errcode) {
    console.log('✗ 失败: ' + r.errmsg + ' (err ' + r.errcode + ')')
    process.exit(1)
  }
  console.log('✓ 已添加 比赛邀请通知 priTmplId=' + r.priTmplId)

  const cur = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  console.log('\n=== 模板库 ===')
  ;(cur.data || []).forEach(t => {
    console.log('- ' + t.title + '  id=' + t.priTmplId)
    console.log('  ' + String(t.content || '').replace(/\n/g, ' | '))
  })
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
