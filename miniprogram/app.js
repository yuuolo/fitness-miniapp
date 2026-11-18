// 后端已迁到自建服务器 https://gym.novrein.com（见 deploy/README.md）
// 这里不再需要 wx.cloud.init；订阅消息模板 ID 仍在小程序后台配置后填到 config.local.js
const config = require('./config')
const subscribe = require('./utils/subscribe')

App({
  globalData: {
    config
  },

  onLaunch() {
    // 预热订阅模板 ID：用户点「订阅」时要同步调用 wx.requestSubscribeMessage，
    // 中间不能夹异步请求，否则微信会报手势丢失（表现为「订阅未成功」）
    subscribe.prefetch()
  }
})
