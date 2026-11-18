const api = require('../../utils/api')
const subscribe = require('../../utils/subscribe')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

Page({
  data: {
    subscribed: false, loaded: false, disabled: false, list: [] },

  // 订阅「竞赛更新」微信提醒
  subscribeCompetitions() {
    subscribe.requestTopics(['competitions']).then(r => {
      const topics = (r && r.accepted) || []
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      this.setData({ subscribed: true })
      wx.showToast({ title: '订阅成功，竞赛有变化会通知你' })
    })
  },

  onShow() {
    features.ensure().then(f => {
      if (f.rank === false) {
        this.setData({ disabled: true, loaded: true })
        return
      }
      this.setData({ disabled: false })
      this.load()
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('competitionList', {}).then(r => {
      const list = (r.list || []).map(c => Object.assign(c, {
        rangeText: fmt.md(c.startAt) + ' 至 ' + fmt.md(c.endAt)
      }))
      this.setData({ loaded: true, list })
    }, () => this.setData({ loaded: true }))
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/competition-detail/competition-detail?id=' + id })
  }
})
