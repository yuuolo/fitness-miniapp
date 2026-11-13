// 后端已迁到自建服务器 https://gym.novrein.com（见 deploy/README.md）
// 这里不再需要 wx.cloud.init；订阅消息模板 ID 仍在小程序后台配置后填到 config.local.js
const config = require('./config')

App({
  globalData: {
    config
  }
})
