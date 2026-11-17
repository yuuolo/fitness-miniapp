// 员工端会员列表：与竞赛录入、友圈代发共用一套会员搜索行为
// （输入即预搜、1 个字起、300ms 防抖、空关键字给默认列表）
const api = require('../../../utils/api')
const fmt = require('../../../utils/format')
const memberSearch = require('../../../utils/member-search')

Page(Object.assign({}, memberSearch.mixin, {

  data: {
    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,
    loaded: false,
    manage: '0',
    admin: '0'
  },

  onLoad(query) {
    const q = query || {}
    this.memberLimit = 50
    this.setData({ manage: q.manage || '0', admin: q.admin || '0' })
    this.fetchMembers().then(() => this.setData({ loaded: true }))
  },

  onUnload() {
    this.stopMemberSearch()
  },

  // 页面自己的映射：补上角色名和加入时间
  mapMembers(list) {
    const limit = this.memberLimit || 50
    return (list || []).slice(0, limit).map(m => Object.assign({}, m, {
      roleName: fmt.ROLE_NAMES[m.role],
      since: fmt.fullDate(m.createdAt)
    }))
  },

  onInput(e) {
    this.memberInput(e)
  },

  onConfirm() {
    this.memberConfirm()
  },

  onSearchTap() {
    this.memberSearchNow()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  open(e) {
    const url = '/pages/staff/member/member?id=' + e.currentTarget.dataset.id +
      '&manage=' + this.data.manage + '&admin=' + this.data.admin
    wx.navigateTo({ url })
  }
}))
