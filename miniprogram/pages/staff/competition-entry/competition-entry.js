const api = require('../../../utils/api')
const memberSearch = require('../../../utils/member-search')
const sfx = require('../../../utils/sfx')

Page(Object.assign({}, memberSearch.mixin, {

  data: {
    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,
    memberOpen: false,
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
    this.memberLimit = 20
    this.fetchMembers()
    api.call('competitionDetail', { id }).then(r => {
      const c = r.competition
      this.setData({ competition: c, unit: c.unit })
      wx.setNavigationBarTitle({ title: '录入成绩 · ' + c.title })
    }, err => wx.showToast({ title: err.message, icon: 'none' }))
  },

  // 默认收起会员列表，点「选择会员」图标才展开
  toggleMemberPick() {
    const open = !this.data.memberOpen
    this.setData({ memberOpen: open })
    if (open && !(this.data.members || []).length) this.fetchMembers()
  },

  // 与会员列表、友圈代发共用同一套搜索：输入即搜（1 个字起）
  onKeyword(e) {
    this.memberInput(e)
  },

  onSearchTap() {
    this.memberSearchNow()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  // 重新选一个人：清空已选并展开列表
  repick() {
    this.setData({ picked: null, memberOpen: true })
    this.memberSearchNow()
  },

  onUnload() {
    this.stopMemberSearch()
  },

  pick(e) {
    const openid = e.currentTarget.dataset.openid
    const m = this.data.members.find(x => x._id === openid)
    this.setData({ picked: m || null, memberOpen: false })
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
      maxDuration: 60,
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传并处理中', mask: true })
        // 统一走 /api/video：按管理页设定限制时长/体积，超时长自动裁切
        api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {
          wx.hideLoading()
          this.setData({ videoUrl: v.fileID, uploading: false })
          if (v.trimmed) {
            wx.showModal({
              title: '已自动裁切',
              content: '原视频 ' + Math.round(v.originalDuration) + ' 秒，已保留前 ' +
                v.keptSeconds + ' 秒（' + (v.bytes / 1024 / 1024).toFixed(1) + 'MB）。',
              showCancel: false
            })
          } else {
            wx.showToast({ title: '视频已上传' })
          }
        }).catch(err => {
          wx.hideLoading()
          this.setData({ uploading: false })
          wx.showModal({
            title: '视频没传上去',
            content: err.message || '请检查网络或视频大小（限制见管理页设定）',
            showCancel: false
          })
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
      sfx.playSave()
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
}))
