// 在「在线健身」类目里找：友圈新视频、竞赛、排行榜更新 相关模板
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
    if (r.errcode) break
    const list = r.data || []
    all.push(...list)
    if (list.length < 30) break
  }
  console.log('模板总数 ' + all.length)

  const groups = {
    '友圈/动态/视频': ['动态', '朋友圈', '视频', '内容', '发布', '更新', '上线'],
    '竞赛/比赛': ['比赛', '竞赛', '赛事', '报名', '开赛'],
    '排行榜/排名/成绩': ['排行', '排名', '榜单', '成绩', '记录', '破纪录', '评分']
  }

  for (const [name, keys] of Object.entries(groups)) {
    console.log('\n=== ' + name + ' ===')
    const seen = new Set()
    for (const x of all) {
      if (seen.has(x.title)) continue
      if (keys.some(k => x.title.includes(k))) {
        seen.add(x.title)
        console.log('- ' + x.title + '  (tid=' + x.tid + ')')
      }
    }
  }
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
