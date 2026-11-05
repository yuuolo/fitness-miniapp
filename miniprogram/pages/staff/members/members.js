const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

Page({
  data: { keyword: '', list: [], loaded: false, admin: '0' },

  onLoad(query) {
    this.setData({ admin: query.admin || '0' })
    this.search()
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  search() {
    return api.call('searchMembers', { keyword: this.data.keyword }).then(list => {
      this.setData({
        loaded: true,
        list: list.map(m => Object.assign(m, { roleName: fmt.ROLE_NAMES[m.role], since: fmt.fullDate(m.createdAt) }))
      })
    })
  },

  open(e) {
    wx.navigateTo({ url: '/pages/staff/member/member?id=' + e.currentTarget.dataset.id + '&admin=' + this.data.admin })
  }
})
