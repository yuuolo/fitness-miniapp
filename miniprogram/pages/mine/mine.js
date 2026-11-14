const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

Page({
  data: { loaded: false, initialized: true, me: null, roleName: '', isStaff: false, blockedText: '', logs: [], features: {} },

  // 自定义 tabBar 的高亮：真机上组件的 pageLifetimes.show 不一定触发，
  // 这里在每个 tab 页 onShow 主动同步一次，保证底部文字颜色跟得上
  syncTabBar() {
    const bar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (bar && typeof bar.refresh === 'function') bar.refresh()
  },

  onShow() {
    this.syncTabBar()
    this.load()
  },

  load() {
    features.ensure().then(f => this.setData({ features: f || {} }))
    return api.call('home', {}, { silent: true }).then(res => {
      if (res.features) features.set(res.features)
      const me = res.me || {}
      this.setData({
        loaded: true,
        initialized: res.initialized,
        me,
        features: res.features || {},
        roleName: fmt.ROLE_NAMES[me.role] || '会员',
        isStaff: !!me.role && me.role !== 'member',
        blockedText: me.blockUntil > Date.now() ? '因缺席次数过多，' + fmt.fullDate(me.blockUntil) + ' 前暂停预约' : ''
      })
      if (res.initialized) {
        api.call('myPoints', {}, { silent: true }).then(p => {
          this.setData({ logs: p.logs.map(l => Object.assign(l, { time: fmt.dateTime(l.createdAt) })) })
        })
      }
    }, err => this.setData({ loaded: true, initialized: false, me: null, logs: [] }))
  },

  // 昵称/头像/手机统一在「完善资料」页里改
  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  goCards() {
    wx.navigateTo({ url: '/pages/cards/cards' })
  },

  goBookings() {
    wx.navigateTo({ url: '/pages/bookings/bookings' })
  },

  goFitness() {
    wx.navigateTo({ url: '/pages/fitness/fitness' })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  goCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/competitions' })
  },

  goStaff() {
    wx.navigateTo({ url: '/pages/staff/index/index' })
  },

  bootstrap() {
    wx.showModal({
      title: '初始化系统',
      content: '你将成为管理员，并写入示例卡种、娱乐项目和未来 3 天的团课。只能执行一次。',
      success: r => {
        if (!r.confirm) return
        api.call('bootstrap', {}, { loading: '初始化中' }).then(() => {
          wx.showToast({ title: '初始化完成' })
          this.load()
        })
      }
    })
  }
})
