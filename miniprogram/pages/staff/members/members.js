const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

Page({
  data: { keyword: '', list: [], loaded: false, manage: '0', admin: '0' },

  onLoad(query) {
    const q = query || {}
    this.setData({ manage: q.manage || '0', admin: q.admin || '0' })
    this.search()
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onConfirm() {
    this.search()
  },

  search() {
    return api.call('searchMembers', { keyword: this.data.keyword }).then(list => {
      this.setData({
        loaded: true,
        list: list.map(m => Object.assign(m, { roleName: fmt.ROLE_NAMES[m.role], since: fmt.fullDate(m.createdAt) }))
      })
    }, err => {
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' })
    })
  },

  open(e) {
    const url = '/pages/staff/member/member?id=' + e.currentTarget.dataset.id +
      '&manage=' + this.data.manage + '&admin=' + this.data.admin
    wx.navigateTo({ url })
  }
})
