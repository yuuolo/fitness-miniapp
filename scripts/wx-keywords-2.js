// 看候选模板的字段（友圈发布 / 竞赛 / 排行榜）
const https = require('https')
const { accessToken } = require('/app/lib/notify')

function get(path) {
  return new Promise((resolve, reject) => {
    https.get('https://api.weixin.qq.com' + path, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error(raw.slice(0, 300))) }
      })
    }).on('error', reject)
  })
}

const TIDS = [76103, 6986, 7447, 54885]

;(async () => {
  const token = await accessToken()
  for (const tid of TIDS) {
    const r = await get('/wxaapi/newtmpl/getpubtemplatekeywords?access_token=' + encodeURIComponent(token) + '&tid=' + tid)
    console.log('=== tid ' + tid + ' ===')
    if (r.errcode) { console.log('  err: ' + r.errmsg); continue }
    ;(r.data || []).forEach(k => console.log('   kid=' + k.kid + '  ' + k.name + '  (示例: ' + (k.example || '') + ')'))
  }
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
