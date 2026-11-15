const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

Page({
  data: { loaded: false, disabled: false, list: [] },

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
