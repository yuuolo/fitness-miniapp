const config = require('./config')

App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '请使用 2.2.3 或以上的基础库以使用云能力', showCancel: false })
      return
    }
    wx.cloud.init({ env: config.envId || undefined, traceUser: true })
  }
})
