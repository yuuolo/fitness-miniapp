// 在「在线健身」类目里找挑战/比赛/活动相关模板
const https = require('https')
const { accessToken } = require('/app/lib/notify')

function get(path) {
  return new Promise((resolve, reject) => {
    https.get('https://api.weixin.qq.com' + path, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error(raw.slice(0, 200))) }
      })
    }).on('error', reject)
  })
}

;(async () => {
  const token = await accessToken()
  const all = []
  for (let start = 0; start < 2000; start += 30) {
    const r = await get('/wxaapi/newtmpl/getpubtemplatetitles?access_token=' + encodeURIComponent(token) +
      '&ids=682&start=' + start + '&limit=30')
    if (r.errcode) { console.log('err@' + start + ': ' + r.errmsg); break }
    const list = r.data || []
    all.push(...list)
    if (list.length < 30) break
  }
  console.log('共拉取 ' + all.length + ' 个模板')
  const keys = ['挑战', '比赛', '对抗', 'PK', '活动', '邀请', '结果', '成绩', '排行', '竞赛', '排名', '通知提醒', '互动', '评论', '留言']
  const hit = all.filter(x => keys.some(k => x.title.includes(k)))
  const seen = new Set()
  console.log('\n命中 ' + hit.length + ' 个：')
  for (const x of hit) {
    if (seen.has(x.title)) continue
    seen.add(x.title)
    console.log('- ' + x.title + '  (tid=' + x.tid + ')')
  }
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
