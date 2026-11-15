const api = require('../../utils/api')

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
    loaded: false,
    openid: '',
    member: null,
    f: null,
    hasBody: false,
    score: 0,
    scoreDetail: [],
    metrics: [],
    bestList: [],
    bodyList: [],
    showAllHistory: false
  },

  onLoad(query) {
    this.setData({ openid: (query && query.openid) || '' })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    const openid = this.data.openid
    if (!openid) {
      return Promise.resolve().then(() => this.setData({ loaded: true }))
    }
    wx.showLoading({ title: '加载中', mask: true })
    return Promise.all([
      api.call('memberProfile', { openid }, { silent: true }),
      api.call('memberFitness', { openid }, { silent: true }).catch(() => null)
    ]).then(([member, f]) => {
      wx.hideLoading()
      wx.setNavigationBarTitle({ title: (member && member.nickName) || '会员资料' })
      const latest = (f && f.latestBody) || null
      const history = (f && f.bodyHistory) || []
      this.setData({
        loaded: true,
        member,
        f,
        hasBody: !!latest,
        score: latest && latest.score != null ? latest.score : 0,
        scoreDetail: (latest && latest.detail) || [],
        metrics: latest ? METRICS.filter(m => latest[m.key] != null && latest[m.key] !== '').map(m => ({
          key: m.key, name: m.name, unit: m.unit, value: latest[m.key]
        })) : [],
        bestList: ((f && f.lifts) || []).map(l => {
          const b = f.bestLift[l.key]
          return { key: l.key, name: l.name, oneRM: b ? b.oneRM : 0, has: !!b }
        }),
        bodyList: history.map(b => ({
          id: b._id,
          date: b.date,
          weight: b.weight == null ? '-' : b.weight,
          bodyFat: b.bodyFat == null ? '-' : b.bodyFat,
          muscle: b.muscle == null ? '-' : b.muscle,
          bmi: b.bmi == null ? '-' : b.bmi,
          score: b.score == null ? '-' : b.score
        }))
      })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  toggleHistory() {
    this.setData({ showAllHistory: !this.data.showAllHistory })
  }
})
