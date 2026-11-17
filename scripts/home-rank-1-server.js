// 排行榜支持「综合评分榜」：按身体评分实时排名
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes("wanted === 'score'")) {
  console.log('· 已有综合评分榜')
  process.exit(0)
}

const anchor = `  const wanted = String(data.lift || '')
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())`

const head = `  const wanted = String(data.lift || '')
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())

  // 「综合评分榜」：按实时身体评分排名（体脂率 40 + 相对力量 40 + 体重指数 20）
  if (wanted === 'score') {
    const all = (await query('select * from members order by created_at')).rows.map(memberRow)
    const rows = []
    for (const m of all) {
      if (!m.latestBody || !m.latestBody.weight) continue
      const scored = withScore(m, m.latestBody)
      if (scored.score == null) continue
      const isPublic = !!m.isBodyPublic
      rows.push({
        openid: m._id,
        name: memberLabel(m),
        value: scored.score,
        oneRM: scored.score,
        weight: isPublic ? m.latestBody.weight : null,
        relative: null,
        bodyScore: scored.score,
        parts: (scored.detail || []).map(d => ({ key: d.key, label: d.label, score: d.score, max: d.max })),
        isMe: m._id === me._id
      })
    }
    rows.sort((a, b) => b.value - a.value)
    rows.forEach((r, i) => { r.rank = i + 1 })

    return {
      lift: 'score',
      liftName: '综合评分',
      autoPicked: false,
      recentAt: 0,
      unit: '分',
      liftMetric: 'score',
      metric,
      period: 'all',
      periodName: '总榜',
      periodFrom: 0,
      total: rows.length,
      top: rows.slice(0, 20),
      me: rows.find(r => r.isMe) || null,
      lifts: [{ key: 'score', name: '综合评分', unit: '分' }].concat(items.map(i => ({ key: i.key, name: i.name, unit: i.unit }))),
      periods: [{ key: 'week', name: '本周' }, { key: 'month', name: '本月' }, { key: 'all', name: '总榜' }]
    }
  }`

if (!t.includes(anchor)) {
  console.log('⚠ 未匹配 leaderboard 开头')
  process.exit(1)
}

t = t.replace(anchor, head)

// 普通力量榜的 lifts 列表也把「综合评分」放在最前面，方便切换
t = t.replace(
  `    lifts: items.map(i => ({ key: i.key, name: i.name, unit: i.unit })),`,
  `    lifts: [{ key: 'score', name: '综合评分', unit: '分' }].concat(items.map(i => ({ key: i.key, name: i.name, unit: i.unit }))),`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 排行榜新增「综合评分榜」')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
