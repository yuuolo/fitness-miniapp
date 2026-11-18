// 把「比赛邀请通知 / 对战结果通知 / 挑战开始提醒」加入小程序模板库
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

// tid → 使用全部字段
const WANT = [
  { tid: 6841, scene: '挑战发起/指派裁判时通知对方' },
  { tid: 48373, scene: '挑战判定结果通知' },
  { tid: 32630, scene: '裁判待判决提醒' }
]

;(async () => {
  const token = await accessToken()

  // 先看已有哪些，避免重复添加
  const cur = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  const titles = new Set((cur.data || []).map(x => x.title))
  console.log('已有模板: ' + [...titles].join('、') + '\n')

  for (const w of WANT) {
    const kw = await request('GET', '/wxaapi/newtmpl/getpubtemplatekeywords?tid=' + w.tid, null, token)
    if (kw.errcode) { console.log('tid ' + w.tid + ' 取字段失败: ' + kw.errmsg); continue }
    const kids = (kw.data || []).map(k => k.kid)
    const titleInfo = await request('GET', '/wxaapi/newtmpl/getpubtemplatetitles?ids=682&start=0&limit=30', null, token)
    // 标题从模板 id 反查（用一次列表查询缓存不现实，这里直接用 tid 匹配的已知标题）
    const nameMap = { 6841: '比赛邀请通知', 48373: '对战结果通知', 32630: '挑战开始提醒' }
    const name = nameMap[w.tid]
    if (titles.has(name)) { console.log('· 已存在，跳过: ' + name); continue }

    const r = await request('POST', '/wxaapi/newtmpl/addtemplate', {
      tid: String(w.tid),
      kidList: kids,
      sceneDesc: w.scene
    }, token)
    if (r.errcode) {
      console.log('✗ 添加失败 ' + name + ': ' + r.errmsg + ' (err ' + r.errcode + ')')
    } else {
      console.log('✓ 已添加: ' + name + '  priTmplId=' + r.priTmplId)
    }
  }

  console.log('\n=== 现在模板库 ===')
  const after = await request('GET', '/wxaapi/newtmpl/gettemplate', null, token)
  ;(after.data || []).forEach(t => {
    console.log('- ' + t.title + '  id=' + t.priTmplId)
    console.log('  ' + String(t.content || '').replace(/\n/g, ' | '))
  })
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
