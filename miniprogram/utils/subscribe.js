// 微信订阅消息授权（一次性）
//
// 关键坑：wx.requestSubscribeMessage 必须由「用户点击」直接触发，
// 中间夹一个异步请求（拉模板 ID）就会报 fail（手势丢失），表现为「订阅未成功」。
// 所以模板 ID 在启动/页面加载时就预取好，用户点按钮时同步调用。
const api = require('./api')

const CACHE_MS = 30 * 60 * 1000
let cache = { at: 0, ids: null }        // 挑战模板
let topicCache = { at: 0, ids: null }   // 内容更新模板

function loadIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.ids)
  return api.call('notifyTemplates', {}, { silent: true }).then(ids => {
    cache = { at: Date.now(), ids: ids || {} }
    return cache.ids
  }, () => ({})).catch(() => ({}))
}

function loadTopicIds() {
  if (topicCache.ids && Date.now() - topicCache.at < CACHE_MS) return Promise.resolve(topicCache.ids)
  return api.call('notifyTopicTemplates', {}, { silent: true }).then(ids => {
    topicCache = { at: Date.now(), ids: ids || {} }
    return topicCache.ids
  }, () => ({})).catch(() => ({}))
}

// 启动时预热（app.js 调一次），这样点按钮时不会因为还在拉 ID 而丢失手势
function prefetch() {
  return Promise.all([loadIds(), loadTopicIds()]).catch(() => null)
}

// 读缓存（同步），拿不到返回 null
function cachedTopicIds() {
  if (!topicCache.ids) return null
  if (Date.now() - topicCache.at > CACHE_MS) return null
  return topicCache.ids
}

function cachedChallengeIds() {
  if (!cache.ids) return null
  if (Date.now() - cache.at > CACHE_MS) return null
  return cache.ids
}

// 弹一次授权（最多 3 个模板 ID，必须同步调用）
function ask(tmplIds) {
  return new Promise(resolve => {
    let done = false
    const finish = res => {
      if (done) return
      done = true
      resolve(res)
    }
    setTimeout(() => finish(null), 8000)
    try {
      wx.requestSubscribeMessage({
        tmplIds,
        success: res => finish(res),
        fail: err => {
          console.warn('requestSubscribeMessage fail', err && err.errMsg)
          finish({ __error: (err && err.errMsg) || 'requestSubscribeMessage:fail' })
        }
      })
    } catch (e) {
      finish({ __error: e.message || 'requestSubscribeMessage:exception' })
    }
  })
}

/**
 * 内容更新订阅：同步版本（必须在点击事件里直接调用）
 * topics 传 moments / competitions / rankScore / rankLift
 * 返回 Promise<{accepted, error}>；accept 后自动在服务端登记票
 */
function requestTopicsSync(topics) {
  const ids = cachedTopicIds()
  if (!ids) return Promise.resolve({ accepted: [], error: 'not-ready' })
  const list = []
  const byTmpl = {}
  for (const topic of topics || []) {
    const id = ids[topic]
    if (!id) continue
    byTmpl[id] = byTmpl[id] || []
    byTmpl[id].push(topic)
    if (list.indexOf(id) < 0) list.push(id)
  }
  if (!list.length) return Promise.resolve({ accepted: [], error: 'no-template' })

  return ask(list.slice(0, 3)).then(res => {
    if (!res) return { accepted: [], error: 'timeout' }
    if (res.__error) return { accepted: [], error: res.__error }
    const accepted = []
    for (const [tmpl, group] of Object.entries(byTmpl)) {
      if (res[tmpl] === 'accept') accepted.push(...group)
    }
    if (!accepted.length) return { accepted: [], error: 'rejected' }
    return accepted.reduce((p, topic) => p.then(() =>
      api.call('subscribeTopic', { topic }, { silent: true }).catch(() => {})
    ), Promise.resolve()).then(() => ({ accepted, error: '' }))
  })
}

// 兼容旧调用：先等模板 ID 再弹（挑战流程里用，那里不是点击直接触发也没关系）
function request(kinds) {
  return loadIds().then(ids => {
    const list = []
    for (const k of kinds || []) {
      const id = ids[k]
      if (id && list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return null
    return ask(list.slice(0, 3))
  }).catch(() => null)
}

function requestTopics(topics) {
  // 有缓存就同步走（保证手势），没缓存就先加载再试
  const cached = cachedTopicIds()
  if (cached) return requestTopicsSync(topics)
  return loadTopicIds().then(() => requestTopicsSync(topics)).catch(() => ({ accepted: [], error: 'load-failed' }))
}

/**
 * 挑战提醒订阅：同步版（必须在点击事件里直接调用）
 * kinds 传 invite / start / result；授权成功后服务端不需要票（挑战模板按事件直接发）
 */
function requestSync(kinds) {
  const ids = cachedChallengeIds()
  if (!ids) return Promise.resolve({ ok: false, error: 'not-ready' })
  const list = []
  for (const k of kinds || []) {
    const id = ids[k]
    if (id && list.indexOf(id) < 0) list.push(id)
  }
  if (!list.length) return Promise.resolve({ ok: false, error: 'no-template' })
  return ask(list.slice(0, 3)).then(res => {
    if (!res) return { ok: false, error: 'timeout' }
    if (res.__error) return { ok: false, error: res.__error }
    const accepted = list.filter(id => res[id] === 'accept')
    return { ok: accepted.length > 0, error: accepted.length ? '' : 'rejected', accepted }
  })
}

module.exports = {
  prefetch, request, requestSync, requestTopics, requestTopicsSync,
  loadIds, loadTopicIds, cachedTopicIds
}
