const theme = require('../../../utils/theme')
const api = require('../../../utils/api')

const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: '', label: '不填' }
]

// 与云函数 fitness.js 的 BODY_NUM_FIELDS 对应，这里只负责采集
const SEG_KEYS = [
  { key: 'leftArm', name: '左上肢' },
  { key: 'rightArm', name: '右上肢' },
  { key: 'trunk', name: '躯干' },
  { key: 'leftLeg', name: '左下肢' },
  { key: 'rightLeg', name: '右下肢' }
]

const EMPTY_BODY = {
  weight: '', height: '', bodyFat: '', heartRate: '', visceral: '', muscle: '',
  muscleRate: '', protein: '', proteinRate: '', water: '', waterRate: '',
  boneMass: '', boneRate: '', fatMass: '', skeletalMuscle: '',
  waistHipRatio: '', bodyAge: '', skeletalMuscleIndex: '', recommendedCalories: '',
  bmr: '', fatFreeMass: '', deviceScore: '',
  bodyShape: '', bodyType: '', deviceName: '', reportImage: '', date: '',
  segmentFat: { leftArm: '', rightArm: '', trunk: '', leftLeg: '', rightLeg: '' },
  segmentMuscle: { leftArm: '', rightArm: '', trunk: '', leftLeg: '', rightLeg: '' }
}

const EMPTY_STRENGTH = { weight: '', reps: '' }
const EMPTY_ACTIVITY = { steps: '', duration: '', calories: '', avgHr: '' }

const RAW_FIELDS = [
  'weight', 'height', 'bodyFat', 'heartRate', 'visceral', 'muscle',
  'muscleRate', 'protein', 'proteinRate', 'water', 'waterRate',
  'boneMass', 'boneRate', 'fatMass', 'skeletalMuscle',
  'waistHipRatio', 'bodyAge', 'skeletalMuscleIndex', 'recommendedCalories',
  'bmr', 'fatFreeMass', 'deviceScore',
  'bodyShape', 'bodyType', 'deviceName', 'reportImage', 'date'
]

Page({

  onShow() {
    theme.sync(this)
  },
  data: {
    themeClass: 'theme-auto',
    id: '', f: null, loaded: false,
    genders: GENDERS, genderIndex: 2,
    lifts: [], liftIndex: 0, actionTypes: [], typeIndex: 0,
    segKeys: SEG_KEYS,
    showDevice: false,
    uploading: false,
    body: EMPTY_BODY,
    strength: EMPTY_STRENGTH,
    activity: EMPTY_ACTIVITY
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


  // ---------- 体测报告识别 ----------

  toggleRecognize() {
    this.setData({ showRecognize: !this.data.showRecognize, recognizeMsg: '' })
  },

  onReportText(e) {
    this.setData({ reportText: e.detail.value })
  },

  // 把解析出来的字段填进表单（教练核对后再保存）
  applyParsed(fields, meta, warnings) {
    const body = Object.assign({}, EMPTY_BODY, this.data.body)
    const KEYS = RAW_FIELDS
    let count = 0
    KEYS.forEach(k => {
      if (fields[k] === undefined || fields[k] === null) return
      body[k] = String(fields[k])
      count++
    })
    // 节段数据是嵌套对象，单独处理
    if (fields.segmentFat) {
      const sf = Object.assign({}, EMPTY_BODY.segmentFat, body.segmentFat || {})
      SEG_KEYS.forEach(s => {
        if (fields.segmentFat[s.key] !== undefined) {
          sf[s.key] = String(fields.segmentFat[s.key])
          count++
        }
      })
      body.segmentFat = sf
    }
    if (fields.segmentMuscle) {
      const sm = Object.assign({}, EMPTY_BODY.segmentMuscle, body.segmentMuscle || {})
      SEG_KEYS.forEach(s => {
        if (fields.segmentMuscle[s.key] !== undefined) {
          sm[s.key] = String(fields.segmentMuscle[s.key])
          count++
        }
      })
      body.segmentMuscle = sm
    }

    const gi = GENDERS.findIndex(g => g.value === (fields.gender || meta.gender || ''))
    const patch = { body }
    if (gi >= 0) patch.genderIndex = gi

    const tip = '已填入 ' + count + ' 项' + (warnings && warnings.length ? '；' + warnings[0] : '')
    patch.recognizeMsg = tip
    this.setData(patch)
    wx.showToast({ title: '已填入 ' + count + ' 项', icon: 'none' })
  },

  // 1) 图片识别（需要服务器配了 OCR 服务）
  chooseAndOcr() {
    if (this.data.recognizing) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        this.setData({ recognizing: true })
        wx.showLoading({ title: '上传中', mask: true })
        api.upload(file.tempFilePath, 'jpg').then(fileID => {
          wx.showLoading({ title: '识别中', mask: true })
          return api.call('ocrBodyReport', { fileID }, { silent: true })
        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
        }).catch(err => {
          wx.hideLoading()
          this.setData({ recognizing: false, recognizeMsg: err.message || '识别失败' })
        })
      }
    })
  },

  // 2) 粘贴文字解析（没有 OCR 服务时用微信「提取文字」拿到文本再粘进来）
  parseReportText() {
    const text = String(this.data.reportText || '').trim()
    if (!text) return wx.showToast({ title: '先把报告文字粘贴进来', icon: 'none' })
    if (this.data.recognizing) return
    this.setData({ recognizing: true })
    api.call('parseBodyReport', { text }, { loading: '解析中' }).then(r => {
      this.setData({ recognizing: false })
      this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
    }).catch(err => {
      this.setData({ recognizing: false, recognizeMsg: err.message || '解析失败' })
    })
  },

  toggleDevice() {
    this.setData({ showDevice: !this.data.showDevice })
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

  // 拍/选一张体测报告照片，传到自建后端，只把图片地址交给服务端
  chooseReport() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传中', mask: true })
        const ext = (file.tempFilePath.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]
        api.upload(file.tempFilePath, ext).then(fileID => {
          wx.hideLoading()
          this.setData({ 'body.reportImage': fileID, uploading: false })
          wx.showToast({ title: '报告已上传' })
        }, () => {
          wx.hideLoading()
          this.setData({ uploading: false })
          wx.showToast({ title: '上传失败', icon: 'none' })
        })
      }
    })
  },

  clearReport() {
    this.setData({ 'body.reportImage': '' })
  },

  previewReport() {
    const fid = this.data.body.reportImage
    if (!fid) return
    wx.previewImage({ current: fid, urls: [fid] })
  },

  submitBody() {
    const b = this.data.body
    if (!b.weight) return wx.showToast({ title: '体重必填', icon: 'none' })
    const payload = { openid: this.data.id }
    RAW_FIELDS.forEach(k => {
      if (b[k] !== '' && b[k] !== undefined && b[k] !== null) payload[k] = b[k]
    })
    const gender = GENDERS[this.data.genderIndex].value
    if (gender) payload.gender = gender
    // 节段数据有填才传
    const segFat = {}
    const segMus = {}
    SEG_KEYS.forEach(s => {
      if (b.segmentFat[s.key] !== '') segFat[s.key] = b.segmentFat[s.key]
      if (b.segmentMuscle[s.key] !== '') segMus[s.key] = b.segmentMuscle[s.key]
    })
    if (Object.keys(segFat).length) payload.segmentFat = segFat
    if (Object.keys(segMus).length) payload.segmentMuscle = segMus

    api.call('saveBodyRecord', payload, { loading: '保存中' }).then(r => {
      wx.showToast({ title: '已录入，评分 ' + r.score })
      this.setData({ body: EMPTY_BODY, showDevice: false })
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
