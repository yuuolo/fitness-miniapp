const api = require('../../../utils/api')

Page({
  data: { m: null, loaded: false },

  onLoad(query) {
    this.id = query.id
    this.load()
  },

  load() {
    return api.call('momentDetail', { id: this.id }).then(m => {
      this.setData({ m, loaded: true })
      wx.setNavigationBarTitle({ title: m.authorName + ' 的训练记录' })
      this.resolveVideo(m)
    }, () => this.setData({ loaded: true }))
  },

  // video 组件不能直接吃云文件 ID，换成临时链接
  resolveVideo(m) {
    const ids = (m.media || []).filter(x => x.type === 'video').map(x => x.fileID)
    if (!ids.length) return
    wx.cloud.getTempFileURL({
      fileList: ids,
      success: res => {
        const map = {}
        ;(res.fileList || []).forEach(f => { if (f.tempFileURL) map[f.fileID] = f.tempFileURL })
        this.setData({
          m: Object.assign({}, this.data.m, {
            media: m.media.map(x => x.type === 'video'
              ? Object.assign({}, x, { url: map[x.fileID] || '' })
              : x)
          })
        })
      }
    })
  },

  like() {
    const m = this.data.m
    if (!m) return
    api.call('likeMoment', { id: m._id }, { silent: true }).then(r => {
      this.setData({ m: Object.assign({}, m, { liked: r.liked, likeCount: r.likeCount }) })
    }, () => {})
  },

  remove() {
    wx.showModal({
      title: '删除动态',
      content: '删除后其他会员看不到这条动态，确定吗？',
      confirmColor: '#d93a3a',
      success: r => {
        if (!r.confirm) return
        api.call('deleteMoment', { id: this.data.m._id }, { loading: '删除中' }).then(() => {
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 500)
        })
      }
    })
  },

  previewMedia(e) {
    const i = Number(e.currentTarget.dataset.index)
    const md = (this.data.m.media || [])[i]
    if (!md) return
    if (md.type === 'video') {
      wx.previewMedia({ sources: [{ url: md.url || md.fileID, type: 'video' }] })
      return
    }
    wx.previewImage({
      current: md.fileID,
      urls: this.data.m.media.filter(x => x.type === 'image').map(x => x.fileID)
    })
  },

  // 转发给好友 / 群
  onShareAppMessage() {
    const m = this.data.m
    return {
      title: m ? (m.authorName + '：' + (m.content || '训练记录')) : '健身友圈',
      path: '/pages/moments/detail/detail?id=' + this.id,
      imageUrl: m && m.media && m.media[0] && m.media[0].type === 'image' ? m.media[0].fileID : ''
    }
  },

  // 分享到朋友圈：只能由用户在右上角菜单触发，小程序没有 API 直接发朋友圈
  onShareTimeline() {
    const m = this.data.m
    return {
      title: m ? (m.authorName + '：' + (m.content || '训练记录')) : '健身友圈',
      query: 'id=' + this.id
    }
  }
})
