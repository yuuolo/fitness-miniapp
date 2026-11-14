const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

Page({
  data: {
    loaded: false, initialized: true, me: null, cards: [], bookings: [],
    features: {},
    rankTop: [], rankMe: null, rankTotal: 0, rankName: '卧推'
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('home', {}, { silent: !this.data.loaded }).then(res => {
      // 后端在 home 里顺带返回功能开关，顺便同步给 tabBar 等订阅者
      if (res.features) features.set(res.features)
      this.setData({
        loaded: true,
        initialized: res.initialized,
        me: res.me,
        features: res.features || {},
        cards: res.cards.map(fmt.decorateCard),
        bookings: res.todayBookings.map(fmt.decorateBooking)
      })
      if (!res.features || res.features.rank !== false) this.loadRank()
      else this.setData({ rankTop: [], rankMe: null, rankTotal: 0 })
    })
  },

  // 首页展示卧推绝对重量榜前十
  loadRank() {
    return api.call('leaderboard', { lift: 'bench', metric: 'absolute' }, { silent: true }).then(r => {
      this.setData({
        rankTop: (r.top || []).slice(0, 5),
        rankMe: r.me,
        rankTotal: r.total,
        rankName: r.liftName
      })
    }, () => {})
  },

  openEntry() {
    wx.navigateTo({ url: '/pages/entry/entry' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  goSchedule() {
    wx.switchTab({ url: '/pages/schedule/schedule' })
  },

  goVenues() {
    wx.switchTab({ url: '/pages/venues/venues' })
  },

  goCards() {
    wx.navigateTo({ url: '/pages/cards/cards' })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  }
})
