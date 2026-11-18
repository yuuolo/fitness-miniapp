// 挑战榜：本周胜场 / 当前连胜 / 总胜场 + 我的战绩与徽章
const api = require('../../../utils/api')

const TABS = [
  { key: 'week', name: '本周胜场' },
  { key: 'streak', name: '当前连胜' },
  { key: 'total', name: '总胜场' }
]

Page({
  data: {
    tabs: TABS,
    tab: 'week',
    week: [], streak: [], total: [],
    mine: null,
    loaded: false
  },

  onShow() { this.load() },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('challengeBoard', {}, { silent: true }).then(r => {
      this.setData({
        week: r.week || [],
        streak: r.streak || [],
        total: r.total || [],
        mine: r.mine || null,
        loaded: true
      })
    }, () => this.setData({ loaded: true }))
  },

  pickTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  openMine() {
    if (!this.data.mine) return
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  }
})
