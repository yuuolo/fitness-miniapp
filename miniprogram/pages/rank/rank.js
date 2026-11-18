const api = require('../../utils/api')
const subscribe = require('../../utils/subscribe')
const features = require('../../utils/features')

// 条形图比例：以第一名为 100%；相对体重榜按 relative 算
// 最小值给 4%，避免最后几名短到看不见
function withPct(list, metric) {
  const key = metric === 'relative' ? 'relative' : 'value'
  const top = list.length ? Number(list[0][key]) || 0 : 0
  return list.map(it => Object.assign({}, it, {
    pct: top > 0 ? Math.max(4, Math.round(((Number(it[key]) || 0) / top) * 100)) : 0
  }))
}

Page({
  data: {
    loaded: false,
    disabled: false,
    lifts: [],
    lift: '',
    period: 'week',
    metric: 'absolute',
    board: null,
    autoNote: ''
  },

  // 订阅排行榜更新（综合评分榜 / 力量榜，可分别订阅）
  subscribeRank(e) {
    const topic = e.currentTarget.dataset.topic
    subscribe.requestTopics([topic]).then(topics => {
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      wx.showToast({ title: '订阅成功，榜单更新会通知你' })
    })
  },

  onLoad(query) {
    // 从首页「综合评分榜」入口进来时，带上 lift=score
    const lift = (query && query.lift) || ''
    if (lift) this.setData({ lift })
  },

  onShow() {
    features.ensure().then(f => {
      if (f.rank === false) {
        this.setData({ disabled: true, loaded: true })
        return
      }
      this.setData({ disabled: false })
      if (!this.data.loaded) this.load()
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    const { lift, period, metric } = this.data
    return api.call('leaderboard', { lift, period, metric }).then(r => {
      // 连点切换时丢掉过期的返回
      if (lift !== this.data.lift || period !== this.data.period || metric !== this.data.metric) return
      const board = Object.assign({}, r, { top: withPct(r.top || [], r.metric) })
      const me = r.me ? withPct([r.me], r.metric)[0] : null
      // 服务端没指定项目时会挑「最近有变化」的那一项，这里给个说明
      const autoNote = r.autoPicked ? ('默认显示最近有更新的「' + r.liftName + '」') : ''
      this.setData({
        loaded: true,
        lifts: r.lifts,
        lift: r.lift,
        autoNote,
        period: r.period,
        metric: r.metric,
        board: Object.assign({}, board, { me })
      })
    }, () => this.setData({ loaded: true }))
  },

  pickLift(e) {
    if (this.data.lift === e.currentTarget.dataset.key) return
    // 手动选过项目后就不再提示「默认显示」
    this.setData({ lift: e.currentTarget.dataset.key, autoNote: '' })
    this.load()
  },

  pickPeriod(e) {
    if (this.data.period === e.currentTarget.dataset.period) return
    this.setData({ period: e.currentTarget.dataset.period })
    this.load()
  },

  pickMetric(e) {
    if (this.data.metric === e.currentTarget.dataset.metric) return
    this.setData({ metric: e.currentTarget.dataset.metric })
    this.load()
  },

  // 点榜单里的会员看他的资料（任何人都能看）
  goMember(e) {
    const openid = e.currentTarget.dataset.openid
    if (!openid) return
    wx.navigateTo({ url: '/pages/member/member?openid=' + openid })
  },

  goCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/competitions' })
  }
})
