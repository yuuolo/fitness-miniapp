const api = require('../../utils/api')

Page({
  data: { loaded: false, lifts: [], lift: 'bench', metric: 'absolute', board: null },

  onLoad() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    const lift = this.data.lift
    const metric = this.data.metric
    return api.call('leaderboard', { lift, metric }).then(r => {
      // 连点切换时丢掉过期的返回
      if (lift !== this.data.lift || metric !== this.data.metric) return
      this.setData({ loaded: true, lifts: r.lifts, board: r })
    }, () => this.setData({ loaded: true }))
  },

  pickLift(e) {
    if (this.data.lift === e.currentTarget.dataset.key) return
    this.setData({ lift: e.currentTarget.dataset.key })
    this.load()
  },

  pickMetric(e) {
    if (this.data.metric === e.currentTarget.dataset.metric) return
    this.setData({ metric: e.currentTarget.dataset.metric })
    this.load()
  }
})
