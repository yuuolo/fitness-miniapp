const config = require('../config')

// 申请订阅消息授权；必须在用户点击触发的回调里调用。无论同意与否都继续后续流程
function subscribe(kinds) {
  const ids = kinds.map(k => config.templates[k]).filter(Boolean)
  if (!ids.length || !wx.requestSubscribeMessage) return Promise.resolve({})
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: res => resolve(res),
      fail: () => resolve({})
    })
  })
}

function enabled(kind) {
  return !!config.templates[kind]
}

module.exports = { subscribe, enabled }
