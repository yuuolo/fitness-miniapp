const api = require('../../utils/api')

const PERIODS = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
  { days: 90, label: '90 天' },
  { days: 365, label: '1 年' }
]

// 设备报告里的指标，有值才显示
const METRICS = [
  { key: 'weight', name: '体重', unit: 'kg' },
  { key: 'bodyFat', name: '体脂率', unit: '%' },
  { key: 'muscle', name: '肌肉量', unit: 'kg' },
  { key: 'muscleRate', name: '肌肉率', unit: '%' },
  { key: 'protein', name: '蛋白质量', unit: 'kg' },
  { key: 'water', name: '体水分量', unit: 'kg' },
  { key: 'boneMass', name: '骨盐量', unit: 'kg' },
  { key: 'fatMass', name: '脂肪量', unit: 'kg' },
  { key: 'skeletalMuscle', name: '骨骼肌量', unit: 'kg' },
  { key: 'visceral', name: '内脏脂肪', unit: '级' },
  { key: 'heartRate', name: '心率', unit: '次/分' },
  { key: 'bmi', name: 'BMI', unit: '' },
  { key: 'waistHipRatio', name: '腰臀比', unit: '' },
  { key: 'bodyAge', name: '身体年龄', unit: '岁' },
  { key: 'bmr', name: '基础代谢', unit: 'kcal' },
  { key: 'fatFreeMass', name: '去脂体重', unit: 'kg' }
]

Page({
  data: {
    loaded: false, f: null, isPublic: false,
    hasBody: false, score: 0, scoreDetail: [],
    metrics: [], bestList: [], bodyList: [], actList: [],
    periods: PERIODS, days: 30, trend: null, trendList: []
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
        // 有值的指标才展示，避免满屏空行
        metrics: latest ? METRICS.filter(m => latest[m.key] != null && latest[m.key] !== '').map(m => ({
          key: m.key, name: m.name, unit: m.unit, value: latest[m.key]
        })) : [],
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
          score: b.score == null ? '-' : b.score,
          deviceScore: b.deviceScore || 0
        })),
        actList: (f.activity || []).map(a => ({
          id: a._id, date: a.date, steps: a.steps || 0, duration: a.duration || 0, calories: a.calories || 0
        }))
      })
      this.loadTrend()
    }, () => this.setData({ loaded: true }))
  },

  loadTrend() {
    return api.call('bodyTrend', { days: this.data.days }, { silent: true }).then(t => {
      const delta = t.delta || {}
      this.setData({
        trend: Object.assign({}, t, {
          hasDelta: Object.keys(delta).length > 0,
          dWeight: delta.weight == null ? null : delta.weight,
          dFat: delta.bodyFat == null ? null : delta.bodyFat,
          dScore: delta.score == null ? null : delta.score
        }),
        trendList: (t.points || []).slice().reverse().map(p => ({
          date: p.date,
          weight: p.weight == null ? '-' : p.weight,
          bodyFat: p.bodyFat == null ? '-' : p.bodyFat,
          score: p.score == null ? '-' : p.score
        }))
      })
    }, () => {})
  },

  pickPeriod(e) {
    const days = Number(e.currentTarget.dataset.days)
    if (days === this.data.days) return
    this.setData({ days })
    wx.showLoading({ title: '加载中' })
    this.loadTrend().then(() => wx.hideLoading(), () => wx.hideLoading())
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
