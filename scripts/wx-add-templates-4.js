// 重试：sceneDesc 不能超过 15 个字符
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

const WANT = [
  { tid: 76103, kids: [1, 2, 3], scene: '友圈发布视频通知', name: '学员作品发布通知' },
  { tid: 54885, kids: [1, 2, 3], scene: '排行榜更新通知', name: '运动排行榜更新通知' }
]

;(async () => {
  const token = await accessToken()
  const cur = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  const titles = new Set((cur.data || []).map(x => x.title))

  for (const w of WANT) {
    if (titles.has(w.name)) { console.log('· 已存在: ' + w.name); continue }
    const r = await request('POST', '/wxaapi/newtmpl/addtemplate', {
      tid: String(w.tid), kidList: w.kids, sceneDesc: w.scene
    }, token)
    if (r.errcode) console.log('✗ ' + w.name + ': ' + r.errmsg + ' (' + r.errcode + ')')
    else console.log('✓ 已添加 ' + w.name + '  id=' + r.priTmplId)
  }

  console.log('\n=== 模板库（只列挑战/友圈/竞赛/排行榜相关）===')
  const after = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  ;(after.data || []).forEach(t => {
    if (!/挑战|作品|赛事|排行|对战|邀请/.test(t.title)) return
    console.log('- ' + t.title + '  id=' + t.priTmplId)
    console.log('  ' + String(t.content || '').replace(/\n/g, ' | '))
  })
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
