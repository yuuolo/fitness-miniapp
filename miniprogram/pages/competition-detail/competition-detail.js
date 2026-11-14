const api = require('../../utils/api')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

Page({
  data: {
    id: '',
    loaded: false,
    disabled: false,
    competition: null,
    ranking: [],
    myRank: null,
    myEntries: []
  },

  onLoad(query) {
    this.setData({ id: (query || {}).id || '' })
  },

  onShow() {
    features.ensure().then(f => {
      if (f.rank === false) {
        this.setData({ disabled: true, loaded: true })
        return
      }
      this.setData({ disabled: false })
      this.load()
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    if (!this.data.id) return Promise.resolve()
    return api.call('competitionDetail', { id: this.data.id }).then(r => {
      const ranking = (r.ranking || []).map(x => Object.assign(x, {
        // 只有带视频的成绩才显示播放入口
        hasVideo: !!x.videoUrl,
        // 「我」标记在这里算好，避免 WXML 里对可能为 null 的对象取属性
        isMe: !!(r.myRank && x.openid === r.myRank.openid),
        valueText: x.value + ' ' + r.competition.unit
      }))
      const myEntries = (r.myEntries || []).map(x => Object.assign(x, {
        hasVideo: !!x.videoUrl,
        valueText: x.value + ' ' + r.competition.unit
      }))
      this.setData({
        loaded: true,
        competition: r.competition,
        ranking,
        myRank: r.myRank,
        myEntries
      })
      wx.setNavigationBarTitle({ title: r.competition.title })
    }, err => this.setData({ loaded: true, error: err.message }))
  },

  // 点击成绩上的视频：小程序原生播放器
  playVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }] })
  },

  // 员工入口：给这场竞赛录成绩
  goEntry() {
    wx.navigateTo({
      url: '/pages/staff/competition-entry/competition-entry?id=' + this.data.id
    })
  },

  goManage() {
    wx.navigateTo({
      url: '/pages/staff/competition-edit/competition-edit?id=' + this.data.id
    })
  }
})
