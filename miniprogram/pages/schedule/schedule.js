const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')
const { subscribe } = require('../../utils/subscribe')

Page({
  data: { days: [], date: '', list: [], loading: false, busyId: '', disabled: false },

  onLoad() {
    const days = fmt.nextDays(7)
    this.setData({ days, date: days[0].date })
  },

  onShow() {
    this.syncTabBar()
    // 功能关闭时直接显示占位，不发请求
    features.ensure().then(f => {
      const off = f.classes === false
      this.setData({ disabled: off })
      if (!off) this.load()
    })
  },

  // 自定义 tabBar 的高亮：真机上组件的 pageLifetimes.show 不一定触发，
  // 这里在每个 tab 页 onShow 主动同步一次，保证底部文字颜色跟得上
  syncTabBar() {
    const bar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (bar && typeof bar.refresh === 'function') bar.refresh()
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
          .then(() => api.call('bookSchedule', { scheduleId: item._id }, { loading: '预约中', silent: true }))
          .then(() => {
            wx.showToast({ title: '预约成功' })
            this.setData({ busyId: '' })
            this.load()
          }, err => {
            this.setData({ busyId: '' })
            const msg = (err && err.message) || '预约失败'
            // 没填手机号时直接引导去完善，而不是只弹一个错误
            if (msg.indexOf('手机号') >= 0) {
              wx.showModal({
                title: '先完善资料',
                content: '约课前要填手机号，方便前台开课前联系你。',
                confirmText: '去完善',
                success: r => {
                  if (r.confirm) wx.navigateTo({ url: '/pages/profile/profile' })
                }
              })
            } else {
              wx.showToast({ title: msg, icon: 'none', duration: 2500 })
            }
          })
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
