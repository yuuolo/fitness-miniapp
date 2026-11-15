const api = require('../../../utils/api')
const fmt = require('../../../utils/format')
const features = require('../../../utils/features')

Page({
  data: {
    role: '',
    isStaff: false,
    isAdmin: false,
    isCoach: false,
  },

  onShow() {

    api.call('home').then(res => {
      const me = res.me
      // 「前台」角色已移除，站内只有管理员拥有到场核验等后台能力
      const isStaff = me.role === 'admin'
      this.setData({
        me,
        role: fmt.ROLE_NAMES[me.role],
        isStaff,
        isAdmin: me.role === 'admin',
        // 教练也能查会员、录体测数据
        isCoach: isStaff || me.role === 'coach'
      })
    }).catch(err => wx.showToast({ title: err.message || '加载失败', icon: 'none' }))
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
