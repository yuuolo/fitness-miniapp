// 挑战大厅：所有会员都能看（公开），可以筛选我参与 / 待我应战 / 待我判决
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')

const TABS = [
  { key: 'all', name: '全部' },
  { key: 'mine', name: '我参与' },
  { key: 'incoming', name: '待我应战' },
  { key: 'judging', name: '待我判决' }
]

// 倒计时文案
function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return ''
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  if (h > 0) return h + ' 小时 ' + (m % 60) + ' 分'
  return Math.max(1, m) + ' 分钟'
}

Page({
  data: {
    tabs: TABS,
    tab: 'all',
    list: [],
    loaded: false,
    loading: false,
    hasMore: true,
    counts: {}
  },

  onShow() {
    this.reload()
    // 每 30 秒刷新一次倒计时
    this.timer = setInterval(() => this.refreshCountdown(), 30 * 1000)
  },

  onHide() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  // 只刷新倒计时，不重新请求
  refreshCountdown() {
    const now = Date.now()
    const list = this.data.list.map(it => Object.assign({}, it, {
      countdownText: countdown(it.deadline),
      expired: it.deadline > 0 && it.deadline <= now
    }))
    this.setData({ list })
  },

  pickTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab, list: [], hasMore: true })
    this.load()
  },

  reload() {
    this.setData({ list: [], hasMore: true, loaded: false })
    return this.load()
  },

  load() {
    if (this.data.loading || !this.data.hasMore) return Promise.resolve()
    this.setData({ loading: true })
    const before = this.data.list.length ? this.data.list[this.data.list.length - 1].createdAt : 0
    return api.call('challengeList', { tab: this.data.tab, before }).then(r => {
      const rows = (r.list || []).map(it => Object.assign({}, it, {
        countdownText: countdown(it.deadline),
        expired: it.deadline > 0 && it.deadline <= Date.now(),
        // 卡片上的一句话状态
        line: it.status === 'pending' ? (it.opponent.isMe ? '对方在等你应战' : '等待对方应战')
          : it.status === 'waiting_referee' ? '等待裁判确认'
            : it.status === 'accepted' ? '双方上传视频中'
              : it.status === 'ready' ? '等待裁判判决'
                : it.judgeResultName || it.statusName
      }))
      this.setData({
        list: this.data.list.concat(rows),
        hasMore: rows.length >= 20,
        loading: false,
        loaded: true,
        counts: r.counts || {}
      })
    }, err => {
      this.setData({ loading: false, loaded: true })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  onReachBottom() {
    this.load()
  },

  open(e) {
    wx.navigateTo({ url: '/pages/challenges/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  goNew() {
    wx.navigateTo({ url: '/pages/challenges/new/new' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  }
})
