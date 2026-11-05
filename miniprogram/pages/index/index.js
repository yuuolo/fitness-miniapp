const api = require('../../utils/api')
const fmt = require('../../utils/format')

Page({
  data: { loaded: false, initialized: true, me: null, cards: [], bookings: [] },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('home', {}, { silent: !this.data.loaded }).then(res => {
      this.setData({
        loaded: true,
        initialized: res.initialized,
        me: res.me,
        cards: res.cards.map(fmt.decorateCard),
        bookings: res.todayBookings.map(fmt.decorateBooking)
      })
    })
  },

  openEntry() {
    wx.navigateTo({ url: '/pages/entry/entry' })
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

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  }
})
