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

// 指标好坏方向：-1 越低越好，1 越高越好，0 中性（不标颜色）
const METRIC_DIR = {
  weight: -1, bodyFat: -1, fatMass: -1, visceral: -1, bmi: -1, waistHipRatio: -1,
  bodyAge: -1, heartRate: 0,
  muscle: 1, muscleRate: 1, protein: 1, water: 1, boneMass: 1,
  skeletalMuscle: 1, bmr: 1, fatFreeMass: 1, score: 1
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10
}

// 最新一条 vs 上一次「有该指标」的记录
function buildCompare(history) {
  const list = history || []
  if (!list.length) return []
  const latest = list[0]
  const out = []
  for (const m of METRICS) {
    const now = latest[m.key]
    if (now == null || now === '') continue
    const prevRec = list.slice(1).find(x => x[m.key] != null && x[m.key] !== '')
    const prev = prevRec ? prevRec[m.key] : null
    let delta = null
    let tone = 'flat'
    if (prev != null) {
      delta = round1(now - prev)
      const dir = METRIC_DIR[m.key] == null ? 0 : METRIC_DIR[m.key]
      if (delta === 0 || dir === 0) tone = 'flat'
      else tone = (delta > 0 ? 1 : -1) === dir ? 'good' : 'bad'
    }
    out.push({
      key: m.key,
      name: m.name,
      unit: m.unit,
      value: now,
      prev,
      prevDate: prevRec ? prevRec.date : '',
      delta,
      hasPrev: prev != null,
      deltaText: delta == null ? '' : (delta > 0 ? '+' : '') + delta,
      tone
    })
  }
  return out
}

const SEG_META = [
  { key: 'leftArm', name: '左上肢', cls: 'seg-la' },
  { key: 'rightArm', name: '右上肢', cls: 'seg-ra' },
  { key: 'trunk', name: '躯干', cls: 'seg-tr' },
  { key: 'leftLeg', name: '左下肢', cls: 'seg-ll' },
  { key: 'rightLeg', name: '右下肢', cls: 'seg-rl' }
]

// 左右差 ≤ 0.3kg 视为均衡；只做自身左右对比，不套用人群标准
function segJudge(diff) {
  if (diff == null) return ''
  return diff <= 0.3 ? '均衡' : '不均衡'
}

function buildSeg(b) {
  if (!b) return null
  const mk = src => {
    const s = src || {}
    const has = SEG_META.some(m => s[m.key] != null)
    if (!has) return null
    const armDiff = (s.leftArm != null && s.rightArm != null) ? Math.abs(s.leftArm - s.rightArm) : null
    const legDiff = (s.leftLeg != null && s.rightLeg != null) ? Math.abs(s.leftLeg - s.rightLeg) : null
    return {
      cells: SEG_META.map(m => ({
        key: m.key,
        name: m.name,
        cls: m.cls,
        value: s[m.key] == null ? '-' : s[m.key]
      })),
      arms: segJudge(armDiff),
      legs: segJudge(legDiff),
      armDiff: armDiff == null ? null : Math.round(armDiff * 10) / 10,
      legDiff: legDiff == null ? null : Math.round(legDiff * 10) / 10
    }
  }
  const fat = mk(b.segmentFat)
  const muscle = mk(b.segmentMuscle)
  if (!fat && !muscle) return null
  return { fat, muscle }
}

Page({
  data: {
    loaded: false, f: null, isPublic: false,
    hasBody: false, score: 0, scoreDetail: [], openid: '',
    metrics: [], compare: [], compareHint: '', bestList: [], bodyList: [], actList: [],
    periods: PERIODS, days: 30, trend: null, trendList: [],
    segTab: 'fat', seg: null, segCurrent: null
  },

  onShow() {
    // 开启右上角「···」里的转发入口
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('myFitness').then(f => {
      const latest = f.latestBody || null
      // 最新一条可能没填节段，往前找最近一条有节段数据的
      const hasSeg = x => !!x && !!x.segmentFat && Object.keys(x.segmentFat).length > 0
      const segSource = hasSeg(latest) ? latest : ((f.bodyHistory || []).find(hasSeg) || null)
      const seg = buildSeg(segSource)
      const segTab = seg && !seg[this.data.segTab] ? (seg.fat ? 'fat' : 'muscle') : this.data.segTab
      this.setData({
        loaded: true,
        f,
        openid: f.openid || '',
        isPublic: f.isBodyPublic,
        hasBody: !!latest,
        seg,
        segTab,
        segCurrent: seg ? seg[segTab] : null,
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
        // 最近两次对比（按日期倒序，第一条是最新）
        compare: buildCompare(f.bodyHistory || []),
        compareHint: (f.bodyHistory || []).length > 1
          ? '左侧是最新（' + ((f.bodyHistory || [])[0] || {}).date + '），右侧上一次（' + ((f.bodyHistory || [])[1] || {}).date + '）'
          : '只有一次记录，再测一次就能对比',
        bodyList: (f.bodyHistory || []).map(b => ({
          id: b._id,
          date: b.date,
          weight: b.weight == null ? '-' : b.weight,
          bodyFat: b.bodyFat == null ? '-' : b.bodyFat,
          bmi: b.bmi == null ? '-' : b.bmi,
          score: b.score == null ? '-' : b.score,
          deviceScore: b.deviceScore || 0,
          reportImage: b.reportImage || ''
        })),
        actList: (f.activity || []).map(a => {
          const names = { walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳', strength: '力量训练', class: '团课', other: '其他' }
          const parts = []
          if (a.distance > 0) parts.push(a.distance + ' 公里')
          if (a.duration > 0) parts.push(a.duration + ' 分钟')
          if (a.steps > 0) parts.push(a.steps + ' 步')
          if (a.calories > 0) parts.push(a.calories + ' 千卡')
          return {
            id: a._id,
            date: a.date,
            typeName: names[a.type] || '运动',
            detail: parts.join(' · '),
            avgHr: a.avgHr || 0
          }
        })
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

  pickSegTab(e) {
    const segTab = e.currentTarget.dataset.tab
    const seg = this.data.seg
    if (!seg || !seg[segTab] || segTab === this.data.segTab) return
    this.setData({ segTab, segCurrent: seg[segTab] })
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

  // 点某个指标 → 看它的历史曲线
  openMetric(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: '/pages/fitness-metric/fitness-metric?key=' + key })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  // 报告图：点击全屏查看（和看相册里的图一样）
  // 会员自己记录运动
  goActivity() {
    wx.navigateTo({ url: '/pages/activity/activity' })
  },

  previewReport(e) {
    const src = (e && e.currentTarget && e.currentTarget.dataset.src) ||
      (this.data.f && this.data.f.latestBody && this.data.f.latestBody.reportImage)
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  // 转发身体数据给朋友
  onShareAppMessage() {
    const f = this.data.f || {}
    const latest = f.latestBody || {}
    const score = latest.score != null ? latest.score : ''
    return {
      title: (score !== '' ? '我的身体数据 · ' + score + ' 分' : '我的身体数据') +
        (latest.date ? '（' + latest.date + '）' : ''),
      path: '/pages/member/member?openid=' + encodeURIComponent(this.data.openid || ''),
      imageUrl: latest.reportImage || ''
    }
  },

  onShareTimeline() {
    const f = this.data.f || {}
    const latest = f.latestBody || {}
    return {
      title: '我的身体数据' + (latest.score != null ? ' · ' + latest.score + ' 分' : ''),
      query: 'openid=' + encodeURIComponent(this.data.openid || ''),
      imageUrl: latest.reportImage || ''
    }
  }
})
