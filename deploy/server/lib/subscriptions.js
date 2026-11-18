// 「内容更新通知」的 action：查模板 ID / 订阅 / 查我的票数
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
    `insert into notify_subscriptions (openid, topic, tickets, updated_at)
     values ($1, $2, $3, $4)
     on conflict (openid, topic) do update
       set tickets = least(notify_subscriptions.tickets + $3, $5), updated_at = $4`,
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
