const api = require('../../utils/api')
const features = require('../../utils/features')

Page({
  data: {
    loaded: false,
    disabled: false,
    lifts: [],
    lift: '',
    period: 'week',
    metric: 'absolute',
    board: null
  },

  onShow() {
    features.ensure().then(f => {
      if (f.rank === false) {
        this.setData({ disabled: true, loaded: true })
        return
      }
      this.setData({ disabled: false })
      if (!this.data.loaded) this.load()
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    const { lift, period, metric } = this.data
    return api.call('leaderboard', { lift, period, metric }).then(r => {
      // 连点切换时丢掉过期的返回
      if (lift !== this.data.lift || period !== this.data.period || metric !== this.data.metric) return
      this.setData({
        loaded: true,
        lifts: r.lifts,
        lift: r.lift,
        period: r.period,
        metric: r.metric,
        board: r
      })
    }, () => this.setData({ loaded: true }))
  },

  pickLift(e) {
    if (this.data.lift === e.currentTarget.dataset.key) return
    this.setData({ lift: e.currentTarget.dataset.key })
    this.load()
  },

  pickPeriod(e) {
    if (this.data.period === e.currentTarget.dataset.period) return
    this.setData({ period: e.currentTarget.dataset.period })
    this.load()
  },

  pickMetric(e) {
    if (this.data.metric === e.currentTarget.dataset.metric) return
    this.setData({ metric: e.currentTarget.dataset.metric })
    this.load()
  },

  goCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/competitions' })
  }
})
