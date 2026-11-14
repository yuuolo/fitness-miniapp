const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

Page({
  data: { stat: null, role: '', isStaff: false, isAdmin: false, isCoach: false, last: null },

  onShow() {
    api.call('dashboard').then(stat => {
      const isStaff = stat.role === 'staff' || stat.role === 'admin'
      this.setData({
        stat,
        role: fmt.ROLE_NAMES[stat.role],
        isStaff,
        isAdmin: stat.role === 'admin',
        // 教练也能查会员、录体测数据
        isCoach: isStaff || stat.role === 'coach'
      })
    })
  },

  scanEntry() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: res => {
        api.call('verifyEntry', { code: res.result }, { loading: '核验中' }).then(r => {
          const info = fmt.decorateCard({ kind: r.kind, remainTimes: r.remainTimes, expireAt: r.expireAt }).summary
          this.setData({ last: Object.assign(r, { info, time: fmt.hhmm(Date.now()) }) })
          wx.vibrateShort({ type: 'medium' })
          wx.showModal({
            title: '允许入场',
            content: r.name + '，' + r.cardName + '，' + info + '。' + r.message,
            showCancel: false
          })
        }, err => {
          this.setData({ last: { denied: true, message: err.message, time: fmt.hhmm(Date.now()) } })
        })
      }
    })
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
