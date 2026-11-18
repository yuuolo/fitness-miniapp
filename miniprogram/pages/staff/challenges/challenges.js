// 教练端：我当裁判的挑战（待接单 / 待判决）
const api = require('../../../utils/api')

function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return '已超时'
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? h + ' 小时 ' + (m % 60) + ' 分' : Math.max(1, m) + ' 分钟'
}

Page({
  data: { list: [], loaded: false, counts: {} },

  onShow() { this.load() },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('challengeList', { tab: 'judging' }, { silent: true }).then(r => {
      const list = (r.list || []).map(it => Object.assign({}, it, {
        countdownText: countdown(it.deadline),
        // 待接单 / 待判决 分两类
        kind: it.canRefereeAct ? 'invite' : (it.canJudge ? 'judge' : 'other')
      }))
      this.setData({ list, counts: r.counts || {}, loaded: true })
    }, () => this.setData({ loaded: true }))
  },

  open(e) {
    wx.navigateTo({ url: '/pages/challenges/detail?id=' + e.currentTarget.dataset.id })
  }
})
