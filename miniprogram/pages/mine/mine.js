const api = require('../../utils/api')
const fmt = require('../../utils/format')

Page({
  data: { loaded: false, initialized: true, me: null, roleName: '', isStaff: false, blockedText: '', logs: [] },

  onShow() {
    this.load()
  },

  load() {
    return api.call('home', {}, { silent: true }).then(res => {
      const me = res.me || {}
      this.setData({
        loaded: true,
        initialized: res.initialized,
        me,
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

  editField(field, title, placeholder) {
    const current = (this.data.me && this.data.me[field]) || ''
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      content: current,
      success: r => {
        if (!r.confirm) return
        api.call('updateProfile', { [field]: r.content }, { loading: '保存中' }).then(me => {
          this.setData({ me: Object.assign({}, this.data.me, me) })
          wx.showToast({ title: '已保存' })
        })
      }
    })
  },

  editName() {
    this.editField('nickName', '修改昵称', '1–20 个字')
  },

  editPhone() {
    this.editField('phone', '填写手机号', '11 位手机号，预约时前台联系用')
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
