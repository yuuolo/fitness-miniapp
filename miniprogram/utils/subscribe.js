// 微信订阅消息授权（一次性）
//
// 规则：一次授权 = 一条消息。所以只在关键动作时申请，用户不点同意也绝不卡流程。
//   · request(kinds)        —— 挑战相关：invite / start / result
//   · requestTopics(topics) —— 内容更新：moments / competitions / rankScore / rankLift
const CACHE_MS = 30 * 60 * 1000
let cache = { at: 0, ids: null }
let topicCache = { at: 0, ids: null }

function loadIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.ids)
  const api = require('./api')
  return api.call('notifyTemplates', {}, { silent: true }).then(ids => {
    cache = { at: Date.now(), ids: ids || {} }
    return cache.ids
  }, () => ({})).catch(() => ({}))
}

function loadTopicIds() {
  if (topicCache.ids && Date.now() - topicCache.at < CACHE_MS) return Promise.resolve(topicCache.ids)
  const api = require('./api')
  return api.call('notifyTopicTemplates', {}, { silent: true }).then(ids => {
    topicCache = { at: Date.now(), ids: ids || {} }
    return topicCache.ids
  }, () => ({})).catch(() => ({}))
}

// 弹授权，3 秒兜底
function ask(tmplIds) {
  return new Promise(resolve => {
    let done = false
    const finish = res => {
      if (done) return
      done = true
      resolve(res)
    }
    setTimeout(() => finish(null), 3000)
    try {
      wx.requestSubscribeMessage({
        tmplIds,
        success: res => finish(res),
        fail: () => finish(null)
      })
    } catch (e) {
      finish(null)
    }
  })
}

/** 挑战通知：kinds 传 invite / start / result */
function request(kinds) {
  return loadIds().then(ids => {
    const list = []
    for (const k of kinds || []) {
      const id = ids[k]
      if (id && list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return null
    return ask(list)
  }).catch(() => null)
}

/** 内容更新：topics 传 moments / competitions / rankScore / rankLift */
function requestTopics(topics) {
  const api = require('./api')
  return loadTopicIds().then(ids => {
    const list = []
    const byTmpl = {}
    for (const topic of topics || []) {
      const id = ids[topic]
      if (!id) continue
      byTmpl[id] = topic
      if (list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return { accepted: [] }
    return ask(list).then(res => {
      if (!res) return { accepted: [] }
      const accepted = []
      for (const [tmpl, topic] of Object.entries(byTmpl)) {
        if (res[tmpl] === 'accept') accepted.push(topic)
      }
      if (!accepted.length) return { accepted: [] }
      // 每个被同意的话题登记一张票（服务端校验签名模板）
      return accepted.reduce((p, topic) => p.then(() =>
        api.call('subscribeTopic', { topic }, { silent: true }).catch(() => {})
      ), Promise.resolve()).then(() => ({ accepted }))
    })
  }, () => ({ accepted: [] })).catch(() => ({ accepted: [] }))
}

module.exports = { request, requestTopics, loadIds, loadTopicIds }
