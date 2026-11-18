const api = require('../../utils/api')
const sfx = require('../../utils/sfx')
const subscribe = require('../../utils/subscribe')
const features = require('../../utils/features')

// 自建后端存的是 https 地址，video 组件可以直接播；不再需要临时链接
function resolveVideoUrls(list) {
  return Promise.resolve(list.map(m => Object.assign({}, m, {
    media: (m.media || []).map(x => x.type === 'video'
      ? Object.assign({}, x, { url: /^https?:\/\//.test(x.fileID) ? x.fileID : '' })
      : x)
  })))
}

Page({
  data: {
    list: [], loaded: false, hasMore: true, loading: false, disabled: false,
    // 搜索：默认收起，点图标才展开；1 个字起就预搜；可以只看视频
    keyword: '', onlyVideo: false, searchOpen: false,
    subscribed: false
  },

  onShow() {
    this.syncTabBar()
    features.ensure().then(f => {
      if (f.moments === false) {
        this.setData({ disabled: true, loaded: true })
        return
      }
      this.setData({ disabled: false })
      this.reload()
    })
  },

  // 自定义 tabBar 的高亮：真机上组件的 pageLifetimes.show 不一定触发，
  // 这里在每个 tab 页 onShow 主动同步一次，保证底部文字颜色跟得上
  syncTabBar() {
    const bar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (bar && typeof bar.refresh === 'function') bar.refresh()
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadMore()
  },

  // 订阅「友圈新视频」微信提醒
  subscribeMoments() {
    subscribe.requestTopics(['moments']).then(topics => {
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      this.setData({ subscribed: true })
      wx.showToast({ title: '订阅成功，有新视频会通知你' })
    })
  },

  // 点搜索图标：展开/收起搜索栏；收起时清掉搜索条件并恢复全部
  toggleSearch() {
    const open = !this.data.searchOpen
    this.setData({ searchOpen: open })
    if (!open) {
      if (this.searchTimer) {
        clearTimeout(this.searchTimer)
        this.searchTimer = null
      }
      if (this.data.keyword || this.data.onlyVideo) {
        this.setData({ keyword: '', onlyVideo: false })
        this.reload()
      }
    }
  },

  // 输入即预搜（300ms 防抖）
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.reload(), 300)
  },

  onSearchConfirm() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.reload()
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ keyword: '', onlyVideo: false })
    this.reload()
  },

  toggleVideoOnly() {
    this.setData({ onlyVideo: !this.data.onlyVideo })
    this.reload()
  },

  // 当前搜索条件（1 个字起就传，服务端按内容/作者名模糊搜）
  searchParams() {
    const p = {}
    const kw = String(this.data.keyword || '').trim()
    if (kw) p.keyword = kw
    if (this.data.onlyVideo) p.onlyVideo = true
    return p
  },

  reload() {
    const params = this.searchParams()
    this.setData({ loading: false })
    return api.call('momentList', params).then(r => resolveVideoUrls(r.list)).then(list => {
      this.setData({ loaded: true, list, hasMore: list.length >= 20 })
    }, () => this.setData({ loaded: true }))
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading || !this.data.list.length) return
    const before = this.data.list[this.data.list.length - 1].createdAt
    this.setData({ loading: true })
    return api.call('momentList', Object.assign({ before }, this.searchParams()), { silent: true })
      .then(r => resolveVideoUrls(r.list))
      .then(list => this.setData({
        list: this.data.list.concat(list),
        hasMore: list.length >= 20,
        loading: false
      }), () => this.setData({ loading: false }))
  },

  goPost() {
    wx.navigateTo({ url: '/pages/moments/post/post' })
  },

  // 删除动态：作者删自己的，管理员可以删任何人的
  remove(e) {
    const id = e.currentTarget.dataset.id
    const mine = e.currentTarget.dataset.mine
    wx.showModal({
      title: '删除动态',
      content: mine ? '删除后其他会员看不到这条动态，确定吗？' : '这是其他会员的动态，删除后对方和所有人都看不到，确定吗？',
      success: res => {
        if (!res.confirm) return
        api.call('deleteMoment', { id }, { loading: '删除中' }).then(() => {
        sfx.playDelete()
          this.setData({ list: this.data.list.filter(m => m._id !== id) })
          wx.showToast({ title: '已删除', icon: 'none' })
        }, err => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        })
      }
    })
  },

  // 点作者看会员资料
  goMember(e) {
    const openid = e.currentTarget.dataset.openid
    if (!openid) return
    wx.navigateTo({ url: '/pages/member/member?openid=' + openid })
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/moments/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  like(e) {
    const id = e.currentTarget.dataset.id
    api.call('likeMoment', { id }, { silent: true }).then(r => {
      this.setData({
        list: this.data.list.map(m => m._id === id
          ? Object.assign({}, m, { liked: r.liked, likeCount: r.likeCount })
          : m)
      })
    }, () => {})
  },

  onShareAppMessage() {
    return { title: '健身友圈 · 来看看大家的训练记录', path: '/pages/moments/moments' }
  }
})
