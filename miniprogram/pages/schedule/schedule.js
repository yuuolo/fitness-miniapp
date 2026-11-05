const api = require('../../utils/api')
const fmt = require('../../utils/format')
const { subscribe } = require('../../utils/subscribe')

Page({
  data: { days: [], date: '', list: [], loading: false, busyId: '' },

  onLoad() {
    const days = fmt.nextDays(7)
    this.setData({ days, date: days[0].date })
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  pickDate(e) {
    this.setData({ date: e.currentTarget.dataset.date })
    this.load()
  },

  load() {
    this.setData({ loading: true })
    const date = this.data.date
    return api.call('listSchedules', { date }).then(list => {
      if (date !== this.data.date) return
      const now = Date.now()
      this.setData({
        loading: false,
        list: list.map(s => Object.assign(s, {
          time: fmt.hhmm(s.startAt),
          endTime: fmt.hhmm(s.startAt + s.duration * 60000),
          started: s.startAt <= now,
          full: s.booked >= s.capacity
        }))
      })
    }, () => this.setData({ loading: false }))
  },

  book(e) {
    const item = this.data.list[e.currentTarget.dataset.index]
    if (this.data.busyId) return
    wx.showModal({
      title: '确认预约',
      content: item.courseName + '，' + this.data.date + ' ' + item.time + (item.room ? '，' + item.room : '') + '。开课前 2 小时内不能取消。',
      success: r => {
        if (!r.confirm) return
        this.setData({ busyId: item._id })
        subscribe(['bookingSuccess', 'classReminder'])
          .then(() => api.call('bookSchedule', { scheduleId: item._id }, { loading: '预约中' }))
          .then(() => {
            wx.showToast({ title: '预约成功' })
            this.setData({ busyId: '' })
            this.load()
          }, () => this.setData({ busyId: '' }))
      }
    })
  },

  cancel(e) {
    const item = this.data.list[e.currentTarget.dataset.index]
    wx.showModal({
      title: '取消预约',
      content: '确定取消「' + item.courseName + '」吗？',
      success: r => {
        if (!r.confirm) return
        api.call('cancelBooking', { bookingId: item.myBookingId }, { loading: '取消中' }).then(() => {
          wx.showToast({ title: '已取消' })
          this.load()
        })
      }
    })
  }
})
