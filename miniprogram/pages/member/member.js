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

// ---------- 和「我」对比 ----------
// dir: high 越高越好 / low 越低越好 / none 只显示差值不分胜负
const PK_METRICS = [
  { key: 'weight', name: '体重', unit: 'kg', dir: 'none' },
  { key: 'bodyFat', name: '体脂率', unit: '%', dir: 'low' },
  { key: 'muscle', name: '肌肉量', unit: 'kg', dir: 'high' },
  { key: 'skeletalMuscle', name: '骨骼肌量', unit: 'kg', dir: 'high' },
  { key: 'visceral', name: '内脏脂肪', unit: '级', dir: 'low' },
  { key: 'bmi', name: 'BMI', unit: '', dir: 'none' },
  { key: 'score', name: '身体评分', unit: '分', dir: 'high' }
]

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

// 生成对比数据；两边都要有最新身体数据才有意义
function buildPk(mine, theirs) {
  const a = (mine && mine.latestBody) || null
  const b = (theirs && theirs.latestBody) || null
  if (!a || !b) return { ready: false, hasMine: !!a, hasTheirs: !!b }

  const rows = []
  let myWins = 0
  let theirWins = 0
  for (const m of PK_METRICS) {
    const av = m.key === 'score' ? a.score : a[m.key]
    const bv = m.key === 'score' ? b.score : b[m.key]
    if (av == null || bv == null || av === '' || bv === '') continue
    const diff = round1(Number(bv) - Number(av))      // 对方 - 我
    let win = ''                                      // '' 不计胜负 / 'me' / 'them' / 'tie'
    if (m.dir === 'high') {
      win = diff > 0.05 ? 'them' : (diff < -0.05 ? 'me' : 'tie')
    } else if (m.dir === 'low') {
      win = diff < -0.05 ? 'them' : (diff > 0.05 ? 'me' : 'tie')
    }
    if (win === 'me') myWins++
    else if (win === 'them') theirWins++
    rows.push({
      key: m.key,
      name: m.name,
      unit: m.unit,
      dir: m.dir,
      mine: av,
      theirs: bv,
      diff: Math.abs(diff),
      win,
      // 差值文本：带方向符号
      diffText: m.dir === 'none' ? (diff === 0 ? '一样' : (diff > 0 ? 'TA 多 ' + Math.abs(diff) : '我多 ' + Math.abs(diff)))
        : (win === 'tie' ? '持平' : (win === 'me' ? '我胜 ' + Math.abs(diff) : 'TA 胜 ' + Math.abs(diff)))
    })
  }

  const myScore = a.score == null ? 0 : a.score
  const theirScore = b.score == null ? 0 : b.score
  return {
    ready: rows.length > 0,
    hasMine: true,
    hasTheirs: true,
    rows,
    myWins,
    theirWins,
    myScore,
    theirScore,
    scoreGap: round1(theirScore - myScore),
    verdict: myScore === theirScore ? 'tie' : (myScore > theirScore ? 'me' : 'them'),
    myDate: a.date || '',
    theirDate: b.date || ''
  }
}

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
    showAllHistory: false,
    pk: null
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
      api.call('memberFitness', { openid }, { silent: true }).catch(() => null),
      // 自己的最新身体数据，用来和对方 PK
      api.call('myFitness', {}, { silent: true }).catch(() => null)
    ]).then(([member, f, mine]) => {
      wx.hideLoading()
      wx.setNavigationBarTitle({ title: (member && member.nickName) || '会员资料' })
      const latest = (f && f.latestBody) || null
      const history = (f && f.bodyHistory) || []
      this.setData({
        loaded: true,
        member,
        f,
        pk: member && member.isMe ? null : buildPk(mine, f),
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
