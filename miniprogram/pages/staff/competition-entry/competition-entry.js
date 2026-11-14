const api = require('../../../utils/api')

Page({
  data: {
    id: '',
    competition: null,
    keyword: '',
    members: [],
    picked: null,
    weight: '',
    reps: '',
    note: '',
    videoUrl: '',
    uploading: false,
    previewValue: '',
    unit: 'kg',
    saving: false
  },

  onLoad(query) {
    const id = (query || {}).id || ''
    this.setData({ id })
    if (!id) {
      wx.showToast({ title: '缺少竞赛 id', icon: 'none' })
      return
    }
    api.call('competitionDetail', { id }).then(r => {
      const c = r.competition
      this.setData({ competition: c, unit: c.unit })
      wx.setNavigationBarTitle({ title: '录入成绩 · ' + c.title })
    }, err => wx.showToast({ title: err.message, icon: 'none' }))
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
  },

  search() {
    const kw = String(this.data.keyword || '').trim()
    if (!kw) return
    api.call('searchMembers', { keyword: kw }, { silent: true }).then(list => {
      this.setData({ members: list.slice(0, 20) })
      if (!list.length) wx.showToast({ title: '没找到会员', icon: 'none' })
    }, err => wx.showToast({ title: err.message || '搜索失败', icon: 'none' }))
  },

  pick(e) {
    const openid = e.currentTarget.dataset.openid
    const m = this.data.members.find(x => x._id === openid)
    this.setData({ picked: m || null })
    if (!m || !m.phone) {
      wx.showToast({ title: '这个会员还没填手机号', icon: 'none' })
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
    this.calcPreview()
  },

  // 前端先算一遍给教练看，最终以后端为准
  calcPreview() {
    const metric = this.data.competition ? this.data.competition.metric : 'oneRM'
    const w = Number(this.data.weight) || 0
    const r = Number(this.data.reps) || 0
    let v = 0
    if (metric === 'maxWeight') v = w
    else if (metric === 'reps') v = r
    else if (metric === 'volume') v = w * r
    else v = r <= 1 ? w : w * (1 + r / 30)
    v = Math.round(v * 10) / 10
    this.setData({ previewValue: v ? String(v) : '' })
  },

  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        if (file.size > 12 * 1024 * 1024) {
          return wx.showToast({ title: '视频超过 12MB，请裁剪后重试', icon: 'none' })
        }
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传中', mask: true })
        api.upload(file.tempFilePath, 'mp4').then(url => {
          wx.hideLoading()
          this.setData({ videoUrl: url, uploading: false })
          wx.showToast({ title: '视频已上传' })
        }, () => {
          wx.hideLoading()
          this.setData({ uploading: false })
          wx.showToast({ title: '视频上传失败', icon: 'none' })
        })
      }
    })
  },

  clearVideo() {
    this.setData({ videoUrl: '' })
  },

  playVideo() {
    if (!this.data.videoUrl) return
    wx.previewMedia({ sources: [{ url: this.data.videoUrl, type: 'video' }] })
  },

  save() {
    if (this.data.saving) return
    const m = this.data.picked
    if (!m) return wx.showToast({ title: '先搜索并选择会员', icon: 'none' })
    const weight = Number(this.data.weight) || 0
    const reps = Number(this.data.reps) || 0
    if (!reps) return wx.showToast({ title: '请填写次数', icon: 'none' })
    if (this.data.competition && this.data.competition.metric !== 'reps' && !weight) {
      return wx.showToast({ title: '请填写重量', icon: 'none' })
    }

    this.setData({ saving: true })
    api.call('recordCompetitionEntry', {
      id: this.data.id,
      openid: m._id,
      weight,
      reps,
      note: this.data.note,
      videoUrl: this.data.videoUrl
    }, { loading: '保存中' }).then(r => {
      this.setData({ saving: false })
      const best = r.myBest
      wx.showModal({
        title: '已录入',
        content: m.nickName + ' 本次成绩 ' + r.entry.value + ' ' + this.data.unit +
          (best ? '，目前最好名次 第 ' + best.rank + ' 名' : ''),
        showCancel: false,
        success: () => {
          this.setData({ picked: null, weight: '', reps: '', note: '', videoUrl: '', previewValue: '' })
        }
      })
    }, () => this.setData({ saving: false }))
  }
})
