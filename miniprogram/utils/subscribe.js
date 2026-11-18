// 微信订阅消息授权（一次性）
//
// 订阅消息是「一次授权发一条」：用户点了按钮同意，之后我们才能给他发一条。
// 所以只在关键动作时申请：发起挑战 / 应战 / 交视频 / 裁判接单。
// 授权结果不影响主流程，失败静默跳过。
const CACHE_MS = 30 * 60 * 1000
let cache = { at: 0, ids: null }

function loadIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.ids)
  const api = require('./api')
  return api.call('notifyTemplates', {}, { silent: true }).then(ids => {
    cache = { at: Date.now(), ids: ids || {} }
    return cache.ids
  }, () => ({})).catch(() => ({}))
}

/**
 * 申请订阅：kinds 里传 invite / start / result
 * 同意后微信记一次额度；失败不影响后续操作。
 */
function request(kinds) {
  return loadIds().then(ids => {
    const list = []
    for (const k of kinds || []) {
      const id = ids[k]
      if (id && list.indexOf(id) < 0) list.push(id)
    }
    if (!list.length) return null
    // 3 秒兜底：微信端没回调（模拟器 / 用户不点）也要继续走主流程
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
          tmplIds: list,
          success: res => finish(res),
          fail: () => finish(null)
        })
      } catch (e) {
        finish(null)
      }
    })
  }).catch(() => null)
}

module.exports = { request, loadIds }
