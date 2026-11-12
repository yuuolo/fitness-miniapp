const api = require('../../../utils/api')

const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: '', label: '不填' }
]

const EMPTY_BODY = { weight: '', height: '', bodyFat: '', muscle: '', visceral: '' }
const EMPTY_STRENGTH = { weight: '', reps: '' }
const EMPTY_ACTIVITY = { steps: '', duration: '', calories: '', avgHr: '' }

Page({
  data: {
    id: '', f: null, loaded: false,
    genders: GENDERS, genderIndex: 2,
    lifts: [], liftIndex: 0, actionTypes: [], typeIndex: 0,
    body: EMPTY_BODY, strength: EMPTY_STRENGTH, activity: EMPTY_ACTIVITY
  },

  onLoad(query) {
    this.setData({ id: query.id || '' })
    this.load()
  },

  load() {
    return api.call('memberFitness', { openid: this.data.id }).then(f => {
      const gi = GENDERS.findIndex(g => g.value === (f.gender || ''))
      this.setData({
        loaded: true,
        f,
        lifts: f.lifts || [],
        actionTypes: f.actionTypes || [],
        genderIndex: gi < 0 ? 2 : gi
      })
    }, () => this.setData({ loaded: true }))
  },

  onBodyInput(e) {
    this.setData({ ['body.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onStrengthInput(e) {
    this.setData({ ['strength.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onActivityInput(e) {
    this.setData({ ['activity.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onGender(e) {
    this.setData({ genderIndex: Number(e.detail.value) })
  },

  onLift(e) {
    this.setData({ liftIndex: Number(e.detail.value) })
  },

  onType(e) {
    this.setData({ typeIndex: Number(e.detail.value) })
  },

  submitBody() {
    const b = this.data.body
    const gender = GENDERS[this.data.genderIndex].value
    api.call('saveBodyRecord', {
      openid: this.data.id,
      weight: Number(b.weight),
      height: Number(b.height) || undefined,
      bodyFat: Number(b.bodyFat) || undefined,
      muscle: Number(b.muscle) || undefined,
      visceral: Number(b.visceral) || undefined,
      gender: gender || undefined
    }, { loading: '保存中' }).then(r => {
      wx.showToast({ title: '已录入，评分 ' + r.score })
      this.setData({ body: EMPTY_BODY })
      this.load()
    })
  },

  submitStrength() {
    const s = this.data.strength
    const lift = this.data.lifts[this.data.liftIndex]
    if (!lift) return wx.showToast({ title: '请选择动作', icon: 'none' })
    api.call('saveStrength', {
      openid: this.data.id, lift: lift.key, weight: Number(s.weight), reps: Number(s.reps)
    }, { loading: '保存中' }).then(r => {
      wx.showToast({ title: '1RM 约 ' + r.oneRM + ' kg' })
      this.setData({ strength: EMPTY_STRENGTH })
      this.load()
    })
  },

  submitActivity() {
    const a = this.data.activity
    const t = this.data.actionTypes[this.data.typeIndex]
    if (!t) return wx.showToast({ title: '请选择类型', icon: 'none' })
    api.call('saveActivity', {
      openid: this.data.id,
      type: t.key,
      steps: Number(a.steps) || undefined,
      duration: Number(a.duration) || undefined,
      calories: Number(a.calories) || undefined,
      avgHr: Number(a.avgHr) || undefined
    }, { loading: '保存中' }).then(() => {
      wx.showToast({ title: '已录入' })
      this.setData({ activity: EMPTY_ACTIVITY })
      this.load()
    })
  }
})
