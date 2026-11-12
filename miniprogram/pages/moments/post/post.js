const api = require('../../../utils/api')

Page({
  data: {
    content: '',
    media: [],
    canCoach: false,
    members: [],
    memberIndex: -1,
    submitting: false
  },

  onLoad() {
    api.call('home', {}, { silent: true }).then(res => {
      const role = res.me && res.me.role
      const canCoach = !!role && role !== 'member'
      this.setData({ canCoach })
      if (canCoach) this.loadMembers()
    }, () => {})
  },

  loadMembers() {
    api.call('searchMembers', { keyword: '' }, { silent: true }).then(list => {
      this.setData({
        members: list.map(m => ({ _id: m._id, name: m.nickName || m.phone || '未命名会员' }))
      })
    }, () => {})
  },

  onContent(e) {
    this.setData({ content: e.detail.value })
  },

  onMember(e) {
    this.setData({ memberIndex: Number(e.detail.value) })
  },

  choose() {
    const left = 9 - this.data.media.length
    if (left <= 0) return wx.showToast({ title: '最多 9 个', icon: 'none' })
    wx.chooseMedia({
      count: left,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      sizeType: ['compressed'],
      success: res => {
        const added = (res.tempFiles || []).map(f => ({
          tempFilePath: f.tempFilePath,
          type: res.type === 'video' ? 'video' : 'image',
          duration: Math.round(f.duration || 0)
        }))
        this.setData({ media: this.data.media.concat(added).slice(0, 9) })
      }
    })
  },

  remove(e) {
    const media = this.data.media.slice()
    media.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ media })
  },

  preview(e) {
    const i = Number(e.currentTarget.dataset.index)
    const m = this.data.media[i]
    if (!m) return
    if (m.type === 'video') {
      wx.previewMedia({ sources: [{ url: m.tempFilePath, type: 'video' }] })
      return
    }
    wx.previewImage({
      current: m.tempFilePath,
      urls: this.data.media.filter(x => x.type === 'image').map(x => x.tempFilePath)
    })
  },

  // 逐个上传到云存储，返回媒体数组给云函数
  uploadAll() {
    const media = this.data.media
    if (!media.length) return Promise.resolve([])
    const tasks = media.map((m, i) => new Promise((resolve, reject) => {
      const ext = (m.tempFilePath.match(/\.[a-zA-Z0-9]+$/) || ['.bin'])[0]
      const cloudPath = 'moments/' + Date.now() + '_' + i + ext
      wx.cloud.uploadFile({
        cloudPath,
        filePath: m.tempFilePath,
        success: res => resolve({ fileID: res.fileID, type: m.type, duration: m.duration || 0 }),
        fail: () => reject(new Error('第 ' + (i + 1) + ' 个文件上传失败'))
      })
    }))
    return Promise.all(tasks)
  },

  submit() {
    if (this.data.submitting) return
    const content = this.data.content.trim()
    if (!content && !this.data.media.length) {
      return wx.showToast({ title: '写点什么或选个视频', icon: 'none' })
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '上传中', mask: true })

    this.uploadAll().then(media => {
      const payload = { content, media }
      // 教练/前台可以指定发给哪位会员
      if (this.data.canCoach && this.data.memberIndex >= 0) {
        const t = this.data.members[this.data.memberIndex]
        if (t) payload.openid = t._id
      }
      return api.call('postMoment', payload, { silent: true })
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '已发布' })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '发布失败', icon: 'none' })
    })
  }
})
