// 添加 3 个模板：学员作品发布（友圈）/ 赛事报名（竞赛）/ 运动排行榜更新
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
  { tid: 76103, kids: [1, 2, 3], scene: '健身友圈有人发布视频时通知其他会员' },
  { tid: 7447, kids: [1, 2, 3, 4, 5], scene: '竞赛有新建/状态变更时通知会员' },
  { tid: 54885, kids: [1, 2, 3], scene: '综合评分榜 / 力量排行榜更新时通知会员' }
]
const NAMES = { 76103: '学员作品发布通知', 7447: '赛事报名通知', 54885: '运动排行榜更新通知' }

;(async () => {
  const token = await accessToken()
  const cur = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  const titles = new Set((cur.data || []).map(x => x.title))

  for (const w of WANT) {
    const name = NAMES[w.tid]
    if (titles.has(name)) { console.log('· 已存在: ' + name); continue }
    const r = await request('POST', '/wxaapi/newtmpl/addtemplate', {
      tid: String(w.tid), kidList: w.kids, sceneDesc: w.scene
    }, token)
    if (r.errcode) console.log('✗ ' + name + ': ' + r.errmsg + ' (' + r.errcode + ')')
    else console.log('✓ 已添加 ' + name + '  id=' + r.priTmplId)
  }

  console.log('\n=== 模板库 ===')
  const after = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  ;(after.data || []).forEach(t => {
    console.log('- ' + t.title + '  id=' + t.priTmplId)
    console.log('  ' + String(t.content || '').replace(/\n/g, ' | '))
  })
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
