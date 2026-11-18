// 「内容更新通知」内部实现（不是 action，供各业务模块调用）
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
