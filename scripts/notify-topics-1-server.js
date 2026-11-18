// 订阅「内容更新通知」——后端（内部 helper 与 action 分两个文件，避免被当成客户端可直接调用的 action）
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// ---------- 1. templates.js：3 个更新通知模板 ----------
edit('lib/templates.js', t => {
  if (t.includes('momentsNew')) return t
  const inject = `
  // ---- 内容更新通知（一次性订阅）----
  // 学员作品发布通知  thing1 练习名称 / thing2 作品名称 / thing3 学员昵称
  momentsNew: {
    id: id('MOMENTS_NEW') || 'tQLp7ap5btQM8Xnnql2Rg3_C1ygO7m1HwzzjV88EnYI',
    page: 'pages/moments/moments',
    fields: v => ({ thing1: v.channel, thing2: v.what, thing3: v.who })
  },
  // 赛事报名通知  thing1 赛事名称 / date2 开赛时间 / thing3 参赛项目 / phrase4 报名状态 / thing5 温馨提示
  competitionNew: {
    id: id('COMPETITION_NEW') || 'SwVg2eYVzJojs8NpRfOl56VxS4p7dPrMlyCzWHE7RnY',
    page: 'pages/competitions/competitions',
    fields: v => ({ thing1: v.title, date2: v.startAt, thing3: v.lift, phrase4: v.state, thing5: v.tip })
  },
  // 运动排行榜更新通知  thing1 榜单名称 / time2 更新时间 / thing3 温馨提示
  rankUpdate: {
    id: id('RANK_UPDATE') || 'dTbxPUeq5j3ATK_aseJzJOIZGSMWKKGTfDdoZ5g53ls',
    page: 'pages/rank/rank',
    fields: v => ({ thing1: v.board, time2: v.time, thing3: v.tip })
  },
`
  return t.replace('module.exports = {', 'module.exports = {\n' + inject)
}, 'templates.js：更新通知模板')

// ---------- 2. 内部 helper：lib/notify-topics.js ----------
const helper = `// 「内容更新通知」内部实现（不是 action，供各业务模块调用）
//
// 微信订阅消息一次性授权：一次授权 = 一条。这里按「话题」记票：
//   · 用户点「订阅提醒」授权成功 → subscriptions.subscribeTopic 加票
//   · 有新内容 → 这里 broadcast 发给有票的人，发成功扣一张
const { query } = require('./db')
const notify = require('./notify')
const templates = require('./templates')

const TOPICS = {
  moments: { name: '友圈更新', kind: 'momentsNew' },
  competitions: { name: '竞赛更新', kind: 'competitionNew' },
  rankScore: { name: '综合评分榜', kind: 'rankUpdate' },
  rankLift: { name: '力量排行榜', kind: 'rankUpdate' }
}

const MAX_TICKETS = 5
const MIN_INTERVAL_MS = 30 * 1000 // 同话题 30 秒内不重复群发
const MAX_RECIPIENTS = 300

const lastBroadcast = {}

function topicMeta(topic) {
  return TOPICS[topic] || null
}

function fmtMinute(ts) {
  const cn = new Date((Number(ts) || Date.now()) + 8 * 3600e3)
  const p = n => String(n).padStart(2, '0')
  return cn.getUTCFullYear() + '-' + p(cn.getUTCMonth() + 1) + '-' + p(cn.getUTCDate()) +
    ' ' + p(cn.getUTCHours()) + ':' + p(cn.getUTCMinutes())
}

async function broadcast(topic, values, opts) {
  const meta = topicMeta(topic)
  if (!meta) return { sent: 0, failed: 0, skipped: 'bad-topic' }
  const now = Date.now()
  if (lastBroadcast[topic] && now - lastBroadcast[topic] < MIN_INTERVAL_MS) {
    return { sent: 0, failed: 0, skipped: 'rate-limited' }
  }
  lastBroadcast[topic] = now

  const exclude = (opts && opts.exclude) || ''
  const rows = (await query(
    'select openid from notify_subscriptions where topic = $1 and tickets > 0 and openid <> $2 limit $3',
    [topic, exclude, MAX_RECIPIENTS]
  )).rows
  if (!rows.length) return { sent: 0, failed: 0, skipped: 'no-subscribers' }

  let sent = 0
  let failed = 0
  for (const row of rows) {
    const ok = await notify.notify(meta.kind, row.openid, values).catch(() => false)
    if (ok) {
      sent++
      await query(
        'update notify_subscriptions set tickets = greatest(tickets - 1, 0), updated_at = $3 where openid = $1 and topic = $2',
        [row.openid, topic, Date.now()]
      )
    } else {
      // 发不出去（多半是用户没真正授权）→ 票清零，避免反复失败
      failed++
      await query(
        'update notify_subscriptions set tickets = 0, updated_at = $3 where openid = $1 and topic = $2',
        [row.openid, topic, Date.now()]
      )
    }
  }
  return { sent, failed, skipped: '' }
}

// 友圈有人发了视频
async function notifyMomentVideo(author, summary) {
  const name = author ? (author.nickName || author.phone || '会员') : '会员'
  return broadcast('moments', {
    channel: '健身友圈',
    what: String(summary || '发布了新视频').slice(0, 20),
    who: String(name).slice(0, 10)
  }, { exclude: author ? author._id : '' })
}

// 竞赛有新建 / 结束
async function notifyCompetition(comp, state, tip) {
  return broadcast('competitions', {
    title: String(comp.title || comp.name || '门店竞赛').slice(0, 20),
    startAt: fmtMinute(comp.start_at || comp.startAt),
    lift: String(comp.lift_name || comp.liftName || '综合').slice(0, 10),
    state: state || '进行中',
    tip: tip || '点开看看排名'
  }, {})
}

// 排行榜更新（综合评分榜 / 力量排行榜）
async function notifyRank(topic, boardName, tip, opts) {
  return broadcast(topic, {
    board: String(boardName).slice(0, 20),
    time: fmtMinute(Date.now()),
    tip: String(tip || '排行榜有更新').slice(0, 20)
  }, { exclude: (opts && opts.exclude) || '' })
}

module.exports = {
  TOPICS,
  topicMeta,
  broadcast,
  notifyMomentVideo,
  notifyCompetition,
  notifyRank,
  MAX_TICKETS
}
`
fs.writeFileSync(SERVER + '/lib/notify-topics.js', helper)
done.push('lib/notify-topics.js（内部 helper）')

// ---------- 3. action 模块：lib/subscriptions.js ----------
const actions = `// 「内容更新通知」的 action：查模板 ID / 订阅 / 查我的票数
const { query } = require('./db')
const { fail, need } = require('./common')
const templates = require('./templates')
const notifyTopics = require('./notify-topics')

const TOPICS = notifyTopics.TOPICS

function assertTopic(topic) {
  if (!TOPICS[topic]) fail('不支持的订阅话题')
  return TOPICS[topic]
}

// 小程序需要模板 ID 才能调 wx.requestSubscribeMessage
async function notifyTopicTemplates({ me }) {
  need(me, 'member')
  const out = {}
  for (const [topic, meta] of Object.entries(TOPICS)) {
    out[topic] = (templates[meta.kind] && templates[meta.kind].id) || ''
  }
  return out
}

// 授权成功后登记一张票
async function subscribeTopic({ me, data }) {
  need(me, 'member')
  const topic = String((data && data.topic) || '')
  assertTopic(topic)
  const add = Math.max(1, Math.min(Number(data && data.count) || 1, notifyTopics.MAX_TICKETS))
  await query(
    \`insert into notify_subscriptions (openid, topic, tickets, updated_at)
     values ($1, $2, $3, $4)
     on conflict (openid, topic) do update
       set tickets = least(notify_subscriptions.tickets + $3, $5), updated_at = $4\`,
    [me._id, topic, add, Date.now(), notifyTopics.MAX_TICKETS]
  )
  return mySubscriptions({ me })
}

async function mySubscriptions({ me }) {
  need(me, 'member')
  const rows = (await query('select topic, tickets from notify_subscriptions where openid = $1', [me._id])).rows
  const topics = {}
  for (const topic of Object.keys(TOPICS)) topics[topic] = 0
  rows.forEach(r => { topics[r.topic] = Number(r.tickets) || 0 })
  const names = {}
  for (const [k, v] of Object.entries(TOPICS)) names[k] = v.name
  return { topics, names, max: notifyTopics.MAX_TICKETS }
}

module.exports = { notifyTopicTemplates, subscribeTopic, mySubscriptions }
`
fs.writeFileSync(SERVER + '/lib/subscriptions.js', actions)
done.push('lib/subscriptions.js（action）')

// ---------- 4. schema ----------
edit('schema.sql', t => {
  if (t.includes('notify_subscriptions')) return t
  return t + `
-- 「内容更新通知」订阅票（一次授权一张票，发一条扣一张）
create table if not exists notify_subscriptions (
  openid     text not null,
  topic      text not null,
  tickets    int not null default 0,
  updated_at bigint not null default 0,
  primary key (openid, topic)
);
`
}, 'schema：订阅票表')

// ---------- 5. index.js ----------
edit('index.js', t => {
  t = t.replace(
    `const MODULES = ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge']`,
    `const MODULES = ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge', 'subscriptions']`
  )
  if (!t.includes('subscribeTopic:')) {
    t = t.replace(
      `  notifyTemplates: 'rank',`,
      `  notifyTemplates: 'rank',
  notifyTopicTemplates: 'rank',
  subscribeTopic: 'rank',
  mySubscriptions: 'rank',`
    )
  }
  return t
}, 'index.js 注册订阅 action')

// ---------- 6. hook：友圈发视频 ----------
edit('lib/moment.js', t => {
  if (t.includes('notifyMomentVideo')) return t
  t = t.replace(
    `const limits = require('./limits')`,
    `const limits = require('./limits')
const notifyTopics = require('./notify-topics')`
  )
  t = t.replace(
    `  return momentRow(row)`,
    `  const saved = momentRow(row)
  // 带视频的动态 → 通知订阅了「友圈更新」的会员（发布人自己不收）
  try {
    const hasVideo = (saved.media || []).some(m => m.type === 'video')
    if (hasVideo) {
      const author = (await query('select * from members where openid = $1', [me._id])).rows[0]
      const summary = String(saved.content || '').slice(0, 12) || '发布了新视频'
      notifyTopics.notifyMomentVideo(memberRow(author), summary).catch(() => {})
    }
  } catch (e) {
    console.warn('notify moment video failed', e.message)
  }
  return saved`
  )
  return t
}, 'hook：友圈发视频')

// ---------- 7. hook：竞赛 ----------
edit('lib/competition.js', t => {
  if (t.includes('notifyCompetition')) return t
  t = t.replace(
    `const { query, tx } = require('./db')`,
    `const { query, tx } = require('./db')
const notifyTopics = require('./notify-topics')`
  )
  // 新建竞赛
  t = t.replace(
    `  return view((await query('select * from competitions where id = $1', [id])).rows[0], { playerCount: 0 })
}`,
    `  const created = view((await query('select * from competitions where id = $1', [id])).rows[0], { playerCount: 0 })
  notifyTopics.notifyCompetition(created, '已开赛', '新竞赛已发布，来报名').catch(() => {})
  return created
}`
  )
  // 结束 / 取消竞赛
  t = t.replace(
    `  await query('update competitions set status = $2, end_at = $3 where id = $1',
    // 手动结束时把结束时间拉到当前，排名停止变化
    [c.id, data.status, data.status === 'ended' ? Math.min(c.end_at, Date.now()) : c.end_at])
  return view((await query('select * from competitions where id = $1', [c.id])).rows[0])`,
    `  await query('update competitions set status = $2, end_at = $3 where id = $1',
    // 手动结束时把结束时间拉到当前，排名停止变化
    [c.id, data.status, data.status === 'ended' ? Math.min(c.end_at, Date.now()) : c.end_at])
  const changed = view((await query('select * from competitions where id = $1', [c.id])).rows[0])
  notifyTopics.notifyCompetition(
    changed,
    data.status === 'ended' ? '已结束' : '已取消',
    data.status === 'ended' ? '排名已截止，看看冠军是谁' : '这场竞赛取消了'
  ).catch(() => {})
  return changed`
  )
  return t
}, 'hook：竞赛新建/结束')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/templates.js', 'lib/notify-topics.js', 'lib/subscriptions.js', 'lib/moment.js', 'lib/competition.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
console.log('  ✓ 语法通过')
