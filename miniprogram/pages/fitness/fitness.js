const api = require('../../utils/api')

Page({
  data: {
    loaded: false, f: null, isPublic: false,
    hasBody: false, score: 0, scoreDetail: [],
    bestList: [], bodyList: [], actList: []
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('myFitness').then(f => {
      const latest = f.latestBody || null
      this.setData({
        loaded: true,
        f,
        isPublic: f.isBodyPublic,
        hasBody: !!latest,
        score: latest && latest.score != null ? latest.score : 0,
        scoreDetail: (latest && latest.detail) || [],
        bestList: (f.lifts || []).map(l => {
          const b = f.bestLift[l.key]
          return { key: l.key, name: l.name, oneRM: b ? b.oneRM : 0, has: !!b }
        }),
        bodyList: (f.bodyHistory || []).map(b => ({
          id: b._id,
          date: b.date,
          weight: b.weight == null ? '-' : b.weight,
          bodyFat: b.bodyFat == null ? '-' : b.bodyFat,
          bmi: b.bmi == null ? '-' : b.bmi,
          score: b.score == null ? '-' : b.score
        })),
        actList: (f.activity || []).map(a => ({
          id: a._id, date: a.date, steps: a.steps || 0, duration: a.duration || 0, calories: a.calories || 0
        }))
      })
    }, () => this.setData({ loaded: true }))
  },

  togglePublic(e) {
    const isPublic = e.detail.value
    api.call('setBodyPublic', { isPublic }, { loading: '保存中' }).then(() => {
      this.setData({ isPublic })
      wx.showToast({ title: isPublic ? '已公开身体数据' : '已设为私密' })
    })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  }
})
