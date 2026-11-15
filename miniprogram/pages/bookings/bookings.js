const api = require('../../utils/api')
const fmt = require('../../utils/format')

const CANCEL_BEFORE = 2 * 3600e3

Page({
  data: { list: [], loaded: false },

  onShow() {
    this.load()
  },

  load() {
    return api.call('myBookings').then(list => {
      const now = Date.now()
      this.setData({
        loaded: true,
        list: list.map(b => Object.assign(fmt.decorateBooking(b), {
          canCancel: b.status === 'booked' && (b.type === 'venue' ? b.startAt > now : b.startAt - now >= CANCEL_BEFORE),
          priceText: b.price ? fmt.yuan(b.price) : ''
        }))
      })
    })
  },

  cancel(e) {
    const item = this.data.list[e.currentTarget.dataset.index]
    wx.showModal({
      title: '取消预约',
      content: '确定取消「' + item.title + '」' + item.timeText + ' 的预约吗？',
      success: r => {
        if (!r.confirm) return
        api.call('cancelBooking', { bookingId: item._id }, { loading: '取消中' }).then(() => {
          wx.showToast({ title: '已取消' })
          this.load()
        })
      }
    })
  }
})
