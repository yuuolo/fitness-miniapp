const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

Page({
  data: { schedule: null, bookings: [] },

  onLoad(query) {
    this.id = query.id
    this.load()
  },

  load() {
    return api.call('roster', { scheduleId: this.id }).then(res => {
      const s = res.schedule
      this.setData({
        schedule: Object.assign(s, {
          time: fmt.md(s.startAt) + ' ' + fmt.hhmm(s.startAt) + '-' + fmt.hhmm(s.startAt + s.duration * 60000)
        }),
        bookings: res.bookings.map(b => Object.assign(b, { statusName: fmt.BOOKING_STATUS[b.status] }))
      })
    })
  },

  mark(e) {
    const { index, status } = e.currentTarget.dataset
    const b = this.data.bookings[index]
    const label = status === 'attended' ? '签到' : '标记缺席'
    wx.showModal({
      title: label,
      content: b.memberName + '（' + b.memberPhone + '）' + (status === 'absent' ? '。累计 3 次缺席将暂停预约 7 天。' : ''),
      success: r => {
        if (!r.confirm) return
        api.call('markAttendance', { bookingId: b._id, status }, { loading: '处理中' }).then(() => {
          wx.showToast({ title: '已' + label })
          this.load()
        })
      }
    })
  },

  dial(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone })
  }
})
