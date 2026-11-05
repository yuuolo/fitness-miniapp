const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

Page({
  data: { days: [], date: '', today: '', list: [], loaded: false },

  onLoad() {
    const days = fmt.nextDays(7)
    this.setData({ days, date: days[0].date, today: days[0].date })
  },

  onShow() {
    this.load()
  },

  pickDate(e) {
    this.setData({ date: e.currentTarget.dataset.date })
    this.load()
  },

  load() {
    const date = this.data.date
    return api.call('venueBookings', { date }).then(list => {
      if (date !== this.data.date) return
      this.setData({
        loaded: true,
        list: list.map(b => Object.assign(fmt.decorateBooking(b), { priceText: fmt.yuan(b.price) }))
      })
    })
  },

  use(e) {
    const b = this.data.list[e.currentTarget.dataset.index]
    wx.showModal({
      title: '核销',
      content: b.memberName + '：' + b.title + ' ' + b.timeText + '。请先收取 ¥' + b.priceText + ' 再核销。',
      success: r => {
        if (!r.confirm) return
        api.call('useVenueBooking', { bookingId: b._id }, { loading: '核销中' }).then(() => {
          wx.showToast({ title: '已核销' })
          this.load()
        })
      }
    })
  }
})
