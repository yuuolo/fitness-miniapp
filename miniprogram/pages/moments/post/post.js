const api = require('../../../utils/api')

// 友圈视频限制：时长 + 压缩后大小，避免把云存储 5GB 额度很快吃满
const MAX_DURATION = 15
const MAX_VIDEO_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

Page({
  data: {
    content: '',
    media: [],
    totalText: '',
    canCoach: false,
    members: [],
    memberIndex: -1,
    submitting: false,
    maxDuration: MAX_DURATION
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

  refreshTotal() {
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0)
    this.setData({ totalText: total ? '共 ' + fmtMB(total) : '' })
    return total
  },

  pushMedia(item) {
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (total > MAX_TOTAL_BYTES) {
      wx.showModal({
        title: '内容太大了',
        content: '合计已超过 ' + fmtMB(MAX_TOTAL_BYTES) + '，请删掉一些再发。',
        showCancel: false
      })
      return false
    }
    const media = this.data.media.concat([Object.assign({}, item, { sizeText: item.size ? fmtMB(item.size) : '' })])
    this.setData({ media })
    this.refreshTotal()
    return true
  },

  // 拍/选一段视频：先限制时长，再压缩，超限直接拦掉
  chooseVideo() {
    if (this.data.media.length >= 9) return wx.showToast({ title: '最多 9 个', icon: 'none' })
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: MAX_DURATION,
      camera: 'back',
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (file) this.compressVideo(file)
      }
    })
  },

  compressVideo(file) {
    const rawSize = file.size || 0
    const duration = Math.round(file.duration || 0)
    if (duration > MAX_DURATION + 1) {
      return wx.showModal({
        title: '视频太长',
        content: '只能发 ' + MAX_DURATION + ' 秒以内的视频，请重新拍摄。',
        showCancel: false
      })
    }

    // 老基础库没有压缩 API，只能靠大小兜底
    if (!wx.compressVideo) {
      if (rawSize > MAX_VIDEO_BYTES) {
        return wx.showModal({
          title: '视频太大',
          content: '当前 ' + fmtMB(rawSize) + '，请拍短一点。',
          showCancel: false
        })
      }
      return this.pushMedia({ tempFilePath: file.tempFilePath, type: 'video', duration, size: rawSize })
    }

    wx.showLoading({ title: '压缩中', mask: true })
    wx.compressVideo({
      src: file.tempFilePath,
      quality: 'low',
      bitrate: 800,
      fps: 24,
      success: r => {
        wx.hideLoading()
        const size = r.size || rawSize
        if (size > MAX_VIDEO_BYTES) {
          return wx.showModal({
            title: '视频仍偏大',
            content: '压缩后 ' + fmtMB(size) + '，超过 ' + fmtMB(MAX_VIDEO_BYTES) + ' 上限，建议拍 10 秒以内。',
            showCancel: false
          })
        }
        this.pushMedia({
          tempFilePath: r.tempFilePath,
          type: 'video',
          duration: Math.round(r.duration || duration),
          size
        })
      },
      fail: () => {
        wx.hideLoading()
        if (rawSize > MAX_VIDEO_BYTES) {
          return wx.showModal({
            title: '视频太大',
            content: '压缩失败，原文件 ' + fmtMB(rawSize) + ' 超过上限，请拍短一点。',
            showCancel: false
          })
        }
        // 压缩失败但原文件可接受，就传原文件
        this.pushMedia({ tempFilePath: file.tempFilePath, type: 'video', duration, size: rawSize })
      }
    })
  },

  chooseImages() {
    const left = 9 - this.data.media.length
    if (left <= 0) return wx.showToast({ title: '最多 9 个', icon: 'none' })
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        (res.tempFiles || []).forEach(f => {
          this.pushMedia({ tempFilePath: f.tempFilePath, type: 'image', duration: 0, size: f.size || 0 })
        })
      }
    })
  },

  remove(e) {
    const media = this.data.media.slice()
    media.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ media })
    this.refreshTotal()
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
    if (this.data.media.reduce((s, m) => s + (m.size || 0), 0) > MAX_TOTAL_BYTES) {
      return wx.showToast({ title: '内容超过大小上限', icon: 'none' })
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '上传中', mask: true })

    this.uploadAll().then(media => {
      const payload = { content, media }
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
