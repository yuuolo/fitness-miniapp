const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

// tabBar 页面必须用 switchTab，其它用 navigateTo
const TAB_PAGES = [
  '/pages/index/index',
  '/pages/schedule/schedule',
  '/pages/moments/moments',
  '/pages/venues/venues',
  '/pages/mine/mine'
]

Page({
  data: {
    loaded: false,
    initialized: true,
    me: null,
    cards: [],
    bookings: [],
    features: {},
    // 管理员在后台配好的首页模块顺序
    layout: [],
    hasBlock: {},
    stat: null,
    rankTop: [],
    rankMe: null,
    rankTotal: 0,
    rankName: '卧推',
    competitions: [],
    moments: []
  },

  onShow() {
    this.syncTabBar()
    this.load()
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

  load() {
    return api.call('home', {}, { silent: !this.data.loaded }).then(res => {
      // 后端在 home 里顺带返回功能开关，顺便同步给 tabBar 等订阅者
      if (res.features) features.set(res.features)

      const blocks = res.layout || []
      // 快速判断「首页有没有这个模块」，用来决定要不要额外请求数据
      const hasBlock = {}
      blocks.forEach(b => { hasBlock[b.type] = true })

      this.setData({
        loaded: true,
        initialized: res.initialized,
        me: res.me,
        features: res.features || {},
        layout: blocks,
        hasBlock,
        cards: (res.cards || []).map(fmt.decorateCard),
        bookings: (res.todayBookings || []).map(fmt.decorateBooking)
      })

      this.loadExtras(hasBlock, res.features || {})

      // 资料没填完时，每次启动小程序自动引导一次去完善（只引导一次，避免反复弹）
      if (res.initialized && res.me && !res.me.profileReady) this.promptProfile()
    })
  },

  // 按布局里实际出现的模块，只拉需要的附加数据
  loadExtras(hasBlock, feat) {
    if (hasBlock.rank && feat.rank !== false) this.loadRank()
    else this.setData({ rankTop: [], rankMe: null, rankTotal: 0 })

    if (hasBlock.stats && this.data.me && this.data.me.role !== 'member') this.loadStats()

    if (hasBlock.competitions && feat.rank !== false) this.loadCompetitions()
    if (hasBlock.moments && feat.moments !== false) this.loadMoments()
  },

  loadStats() {
    return api.call('dashboard', {}, { silent: true }).then(stat => this.setData({ stat }), () => {})
  },

  // 首页展示排行榜前 5
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

  loadCompetitions() {
    return api.call('competitionList', {}, { silent: true }).then(r => {
      const list = (r.list || [])
        .filter(c => c.status === 'active' || c.status === 'upcoming')
        .slice(0, 3)
      this.setData({ competitions: list })
    }, () => {})
  },

  loadMoments() {
    return api.call('momentList', { page: 1 }, { silent: true }).then(r => {
      const list = (r.list || []).slice(0, 3).map(m => ({
        _id: m._id,
        nickName: m.nickName,
        content: (m.content || '').slice(0, 40),
        image: (m.images && m.images.length) ? m.images[0] : '',
        timeText: m.timeText || ''
      }))
      this.setData({ moments: list })
    }, () => {})
  },

  promptProfile() {
    const app = getApp()
    if (!app.globalData) app.globalData = {}
    if (app.globalData.profilePrompted) return
    app.globalData.profilePrompted = true
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/profile/profile?first=1' })
    }, 500)
  },

  // ---------- 跳转 ----------

  navTo(url) {
    if (!url) return
    const clean = url.split('?')[0]
    if (TAB_PAGES.indexOf(clean) >= 0) wx.switchTab({ url: clean })
    else wx.navigateTo({ url })
  },

  // 自定义快捷入口 / 通用链接
  goLink(e) {
    this.navTo(e.currentTarget.dataset.page)
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

  goMoments() {
    wx.switchTab({ url: '/pages/moments/moments' })
  },

  goCards() {
    wx.navigateTo({ url: '/pages/cards/cards' })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  goCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/competitions' })
  },

  goCompetition(e) {
    wx.navigateTo({ url: '/pages/competition-detail/competition-detail?id=' + e.currentTarget.dataset.id })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  }
})
