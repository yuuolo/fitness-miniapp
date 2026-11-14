const api = require('../../../utils/api')

Page({
  data: {
    loaded: false,
    list: [],
    lifts: []
  },

  onShow() {
    this.load()
  },

  load() {
    return Promise.all([
      api.call('myCompetitions', {}, { silent: true }),
      api.call('listLiftItems', {}, { silent: true })
    ]).then(([list, items]) => {
      this.setData({ loaded: true, list: list || [], lifts: (items && items.items) || [] })
    }, err => {
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/staff/competition-edit/competition-edit' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/staff/competition-edit/competition-edit?id=' + id })
  },

  goEntry(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/staff/competition-entry/competition-entry?id=' + id })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/competitions/detail/detail?id=' + id })
  },

  endIt(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '结束竞赛',
      content: '结束后不能再录入成绩，排名保留。确定吗？',
      success: r => {
        if (!r.confirm) return
        api.call('setCompetitionStatus', { id, status: 'ended' }, { loading: '处理中' })
          .then(() => { wx.showToast({ title: '已结束' }); this.load() })
      }
    })
  },

  cancelIt(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '取消竞赛',
      content: '取消后会员看不到这场竞赛，确定吗？',
      confirmColor: '#d93a3a',
      success: r => {
        if (!r.confirm) return
        api.call('setCompetitionStatus', { id, status: 'cancelled' }, { loading: '处理中' })
          .then(() => { wx.showToast({ title: '已取消' }); this.load() })
      }
    })
  }
})
