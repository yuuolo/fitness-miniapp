const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')
const { subscribe } = require('../../utils/subscribe')

Page({
  data: { venues: [], venueIndex: 0, days: [], date: '', venue: null, slots: [], busy: false, disabled: false },

  onLoad() {
    const days = fmt.nextDays(7)
    this.setData({ days, date: days[0].date })
  },

  onShow() {
    // 功能关闭时直接显示占位
    features.ensure().then(f => {
      if (f.venues === false) {
        this.setData({ disabled: true })
        return
      }
      this.setData({ disabled: false })
      api.call('listVenues').then(venues => {
        const index = Math.min(this.data.venueIndex, Math.max(venues.length - 1, 0))
        this.setData({
          venues: venues.map(v => Object.assign(v, { priceText: fmt.yuan(v.price) })),
          venueIndex: index
        })
        if (venues.length) this.loadSlots()
      })
    })
  },

  pickVenue(e) {
    this.setData({ venueIndex: Number(e.currentTarget.dataset.index) })
    this.loadSlots()
  },

  pickDate(e) {
    this.setData({ date: e.currentTarget.dataset.date })
    this.loadSlots()
  },

  loadSlots() {
    const venue = this.data.venues[this.data.venueIndex]
    if (!venue) return
    const key = venue._id + this.data.date
    this.loadingKey = key
    return api.call('venueSlots', { venueId: venue._id, date: this.data.date }).then(res => {
      if (this.loadingKey !== key) return
      this.setData({ venue: res.venue, slots: res.slots })
    })
  },

  tapSlot(e) {
    const slot = this.data.slots[e.currentTarget.dataset.index]
    const venue = this.data.venue
    if (this.data.busy || slot.past) return
    if (slot.myBookingId) {
      wx.showModal({
        title: '取消预约',
        content: '取消 ' + venue.name + ' ' + slot.label + ' 的预约？',
        success: r => {
          if (!r.confirm) return
          api.call('cancelBooking', { bookingId: slot.myBookingId }, { loading: '取消中' }).then(() => {
            wx.showToast({ title: '已取消' })
            this.loadSlots()
          })
        }
      })
      return
    }
    if (slot.remain <= 0) return
    wx.showModal({
      title: '确认预约',
      content: venue.name + '，' + this.data.date + ' ' + slot.label + ' 起 1 小时。到店付款 ¥' + fmt.yuan(venue.price) + '，凭预约到前台核销。',
      success: r => {
        if (!r.confirm) return
        this.setData({ busy: true })
        subscribe(['bookingSuccess'])
          .then(() => api.call('bookVenue', { venueId: venue._id, date: this.data.date, hour: slot.hour }, { loading: '预约中' }))
          .then(() => {
            wx.showToast({ title: '预约成功' })
            this.setData({ busy: false })
            this.loadSlots()
          }, () => this.setData({ busy: false }))
      }
    })
  }
})
