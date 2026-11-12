const api = require('../../utils/api')

// 云存储 fileID 给 image 用没问题，video 需要换成临时链接
function resolveVideoUrls(list) {
  const ids = []
  list.forEach(m => (m.media || []).forEach(x => {
    if (x.type === 'video' && x.fileID) ids.push(x.fileID)
  }))
  if (!ids.length) return Promise.resolve(list)
  return new Promise(resolve => {
    wx.cloud.getTempFileURL({
      fileList: ids,
      success: res => {
        const map = {}
        ;(res.fileList || []).forEach(f => { if (f.tempFileURL) map[f.fileID] = f.tempFileURL })
        resolve(list.map(m => Object.assign({}, m, {
          media: (m.media || []).map(x => x.type === 'video'
            ? Object.assign({}, x, { url: map[x.fileID] || '' })
            : x)
        })))
      },
      fail: () => resolve(list)
    })
  })
}

Page({
  data: { list: [], loaded: false, hasMore: true, loading: false },

  onShow() {
    this.reload()
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadMore()
  },

  reload() {
    return api.call('momentList', {}).then(r => resolveVideoUrls(r.list)).then(list => {
      this.setData({ loaded: true, list, hasMore: this.data.hasMore && list.length > 0 })
    }, () => this.setData({ loaded: true }))
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading || !this.data.list.length) return
    const before = this.data.list[this.data.list.length - 1].createdAt
    this.setData({ loading: true })
    return api.call('momentList', { before }, { silent: true })
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
