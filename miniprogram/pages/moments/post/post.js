const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const memberSearch = require('../../../utils/member-search')

// 友圈上传限制：默认值只是兜底，真正生效的是管理页配置（首页接口下发）
const FALLBACK = {
  maxDuration: 15,
  maxVideoBytes: 12 * 1024 * 1024,
  maxCount: 9,
  maxTotalBytes: 40 * 1024 * 1024
}

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

Page(Object.assign({}, memberSearch.mixin, {

  // 取当前生效的限制（服务端没返回就用兜底值）
  lim() {
    return this.limits || FALLBACK
  },

  data: {
    content: '',
    media: [],
    totalText: '',
    canCoach: false,
    // 代发时选会员：与其它页面一致的搜索行为
    members: [],
    keyword: '',
    memberLoading: false,
    memberEmpty: false,
    pickedMember: null,
    memberOpen: false,
    submitting: false,
    maxDuration: FALLBACK.maxDuration,
    maxDurationText: '',
    maxCount: FALLBACK.maxCount,
    limitText: ''
  },

  onLoad() {
    api.call('home', {}, { silent: true }).then(res => {
      const role = res.me && res.me.role
      const canCoach = !!role && role !== 'member'
      // 管理页配置的上传/展示限制
      const lim = (res && res.mediaLimits) || {}
      const mb = n => (Number(n) || 0) * 1024 * 1024
      // 管理页填 0 表示不限：时长和体积用 0 表示不限，数量固定 1–9
      const num = (v, fallback) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0 ? Math.round(n) : (n === 0 ? 0 : fallback)
      }
      const dur = num(lim.maxDuration, FALLBACK.maxDuration)
      const videoMB = num(lim.maxVideoMB, FALLBACK.maxVideoBytes / 1024 / 1024)
      const totalMB = num(lim.maxTotalMB, FALLBACK.maxTotalBytes / 1024 / 1024)
      this.limits = {
        maxDuration: dur,                                  // 0 = 不限
        maxVideoBytes: videoMB > 0 ? mb(videoMB) : 0,      // 0 = 不限
        maxCount: num(lim.maxCount, FALLBACK.maxCount),
        maxTotalBytes: totalMB > 0 ? mb(totalMB) : 0       // 0 = 不限
      }
      const sayDur = dur > 0 ? '视频 ≤ ' + dur + ' 秒' : '视频不限时长'
      const sayTotal = totalMB > 0 ? '合计 ≤ ' + fmtMB(mb(totalMB)) : '合计不限大小'
      this.setData({
        canCoach,
        maxDuration: dur > 0 ? dur : 60,
        maxDurationText: dur > 0 ? dur + ' 秒' : '不限',
        maxCount: this.limits.maxCount,
        limitText: sayDur + '，最多 ' + this.limits.maxCount + ' 个，' + sayTotal
      })
      if (canCoach) this.loadMembers()
    }, () => {})
  },

  loadMembers() {
    this.memberLimit = 20
    return this.fetchMembers()
  },

  // 默认收起会员列表，点「选择会员」图标才展开
  toggleMemberPick() {
    const open = !this.data.memberOpen
    this.setData({ memberOpen: open })
    if (open && !(this.data.members || []).length) this.fetchMembers()
  },

  onKeywordInput(e) {
    this.memberInput(e)
  },

  onKeywordConfirm() {
    this.memberConfirm()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ pickedMember: m, memberOpen: false })
  },

  clearPickedMember() {
    this.setData({ pickedMember: null, memberOpen: false })
  },

  onUnload() {
    this.stopMemberSearch()
  },

  onContent(e) {
    this.setData({ content: e.detail.value })
  },

  refreshTotal() {
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0)
    this.setData({ totalText: total ? '共 ' + fmtMB(total) : '' })
    return total
  },

  pushMedia(item) {
    const lim = this.lim()
    if (this.data.media.length >= lim.maxCount) {
      wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })
      return false
    }
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (lim.maxTotalBytes > 0 && total > lim.maxTotalBytes) {
      wx.showModal({
        title: '内容太大了',
        content: '合计已超过 ' + fmtMB(lim.maxTotalBytes) + '，请删掉一些再发。',
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
    const lim = this.lim()
    if (this.data.media.length >= lim.maxCount) return wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      // 微信这个参数只接受 3–60 秒；配置更大时按 60 录（相册选的不受此限）
      maxDuration: Math.min(60, Math.max(3, Number(lim.maxDuration) || 60)),
      camera: 'back',
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        // 先探测时长：超过限制就不再当场上传，交给服务端裁切（或让用户重选）
        wx.getVideoInfo({
          src: file.tempFilePath,
          success: info => {
            const realDuration = Math.round(info.duration || file.duration || 0)
            const lim = this.lim()
            if (realDuration > lim.maxDuration + 1) {
              return this.askTrim(file, realDuration)
            }
            this.compressVideo(Object.assign({}, file, { duration: realDuration }))
          },
          fail: () => this.compressVideo(file)
        })
      }
    })
  },

  // 视频超过限制：告诉用户，并给「只保留前 N 秒」的选择（裁切在服务端做）
  askTrim(file, duration) {
    const lim = this.lim()
    if (!(lim.maxDuration > 0)) return this.compressVideo(file)
    const rawMB = (file.size || 0) / 1024 / 1024
    wx.showModal({
      title: '视频超过 ' + lim.maxDuration + ' 秒',
      content: '这段视频 ' + duration + ' 秒。可以只保留前 ' + lim.maxDuration +
        ' 秒上传（越长的部分会被裁掉，原视频需要先传上去，请确保网络良好）' +
        (rawMB ? '，原视频约 ' + rawMB.toFixed(1) + 'MB' : ''),
      confirmText: '保留前' + lim.maxDuration + '秒',
      cancelText: '重新选',
      success: r => {
        if (!r.confirm) return
        this.trimUpload(file, duration)
      }
    })
  },

  // 服务端裁切上传：显示进度，完成后告诉用户裁掉了多少
  trimUpload(file, duration) {
    const lim = this.lim()
    wx.showLoading({ title: '上传并裁切中', mask: true })
    api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {
      wx.hideLoading()
      const item = {
        tempFilePath: file.tempFilePath,
        fileID: v.fileID,
        type: 'video',
        duration: Math.round(v.duration || lim.maxDuration),
        size: v.bytes || 0,
        thumbPath: file.thumbTempFilePath || '',
        trimmedFrom: v.trimmed ? Math.round(v.originalDuration || duration) : 0
      }
      if (!this.pushMedia(item)) return
      if (v.trimmed) {
        wx.showModal({
          title: '已自动裁切',
          content: '原视频 ' + Math.round(v.originalDuration || duration) + ' 秒，已保留前 ' +
            lim.maxDuration + ' 秒（' + fmtMB(v.bytes || 0) + '）。发布后其他会员看到的也是裁切后的版本。',
          showCancel: false
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showModal({
        title: '视频太长了',
        content: err.message || '处理失败，建议到相册里裁剪后再发，或重拍一段更短的。',
        showCancel: false
      })
    })
  },

  compressVideo(file) {
    const rawSize = file.size || 0
    const duration = Math.round(file.duration || 0)
    // 选视频时微信会给一张封面图，海报要用，别丢
    const thumbPath = file.thumbTempFilePath || ''
    const lim = this.lim()
    // maxDuration 为 0 表示不限时长
    if (lim.maxDuration > 0 && duration > lim.maxDuration + 1) {
      return this.askTrim(file, duration)
    }

    // 老基础库没有压缩 API，只能靠大小兜底
    if (!wx.compressVideo) {
      if (rawSize > lim.maxVideoBytes) {
        return wx.showModal({
          title: '视频太大',
          content: '当前 ' + fmtMB(rawSize) + '，请拍短一点。',
          showCancel: false
        })
      }
      return this.pushMedia({ tempFilePath: file.tempFilePath, type: 'video', duration, size: rawSize, thumbPath })
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
        if (size > lim.maxVideoBytes) {
          return wx.showModal({
            title: '视频仍偏大',
            content: '压缩后 ' + fmtMB(size) + '，超过 ' + fmtMB(lim.maxVideoBytes) + ' 上限，建议拍 10 秒以内。',
            showCancel: false
          })
        }
        this.pushMedia({
          tempFilePath: r.tempFilePath,
          type: 'video',
          duration: Math.round(r.duration || duration),
          size,
          thumbPath
        })
      },
      fail: () => {
        wx.hideLoading()
        if (rawSize > lim.maxVideoBytes) {
          return wx.showModal({
            title: '视频太大',
            content: '压缩失败，原文件 ' + fmtMB(rawSize) + ' 超过上限，请拍短一点。',
            showCancel: false
          })
        }
        // 压缩失败但原文件可接受，就传原文件
        this.pushMedia({ tempFilePath: file.tempFilePath, type: 'video', duration, size: rawSize, thumbPath })
      }
    })
  },

  chooseImages() {
    const lim = this.lim()
    const left = lim.maxCount - this.data.media.length
    if (left <= 0) return wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })
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
    const upload = (filePath) => api.upload(filePath)
    const tasks = media.map((m) => {
      // 长视频已经在裁切接口里传好了，直接用返回的地址
      if (m.fileID) {
        const ready = { fileID: m.fileID, type: m.type, duration: m.duration || 0, size: m.size || 0 }
        if (m.type !== 'video' || !m.thumbPath) return Promise.resolve(ready)
        return upload(m.thumbPath)
          .then(thumb => Object.assign(ready, { thumb }))
          .catch(() => ready)
      }
      return upload(m.tempFilePath).then(fileID => {
        const item = { fileID, type: m.type, duration: m.duration || 0, size: m.size || 0 }
        if (m.type !== 'video' || !m.thumbPath) return item
        // 视频封面单独传一份，海报和列表预览都能用
        return upload(m.thumbPath)
          .then(thumb => Object.assign(item, { thumb }))
          .catch(() => item)
      })
    })
    return Promise.all(tasks)
  },

  submit() {
    if (this.data.submitting) return
    const content = this.data.content.trim()
    if (!content && !this.data.media.length) {
      return wx.showToast({ title: '写点什么或选个视频', icon: 'none' })
    }
    const limSubmit = this.lim()
    if (limSubmit.maxTotalBytes > 0 && this.data.media.reduce((s, m) => s + (m.size || 0), 0) > limSubmit.maxTotalBytes) {
      return wx.showToast({ title: '内容超过大小上限', icon: 'none' })
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '上传中', mask: true })

    this.uploadAll().then(media => {
      const payload = { content, media }
      if (this.data.canCoach && this.data.pickedMember) {
        payload.openid = this.data.pickedMember._id
      }
      return api.call('postMoment', payload, { silent: true })
    }).then(() => {
      wx.hideLoading()
      sfx.playSave()
      wx.showToast({ title: '已发布' })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '发布失败', icon: 'none' })
    })
  }
}))
