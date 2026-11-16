const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')

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
const EMPTY_ACTIVITY = {}

const RAW_FIELDS = [
  'weight', 'height', 'bodyFat', 'heartRate', 'visceral', 'muscle',
  'muscleRate', 'protein', 'proteinRate', 'water', 'waterRate',
  'boneMass', 'boneRate', 'fatMass', 'skeletalMuscle',
  'waistHipRatio', 'bodyAge', 'skeletalMuscleIndex', 'recommendedCalories',
  'bmr', 'fatFreeMass', 'deviceScore',
  'bodyShape', 'bodyType', 'deviceName', 'reportImage', 'date'
]

// 按运动类型给出填写提示
function hintOf(type) {
  if (!type || !type.fields) return ''
  const names = type.fields.map(f => f.label + '(' + f.unit + ')')
  if (type.strict) {
    const req = type.fields.find(f => f.required)
    return '必填：' + (req ? req.label : '') + '；其他选填'
  }
  const reqs = (type.required || []).map(k => {
    const f = type.fields.find(x => x.key === k)
    return f ? f.label : k
  })
  return '至少填一项：' + reqs.join(' / ') + '；其他选填'
}

// 力量成绩历史：把项目 key 换成名称，并标出当前最好成绩
function buildStrengthList(f) {
  const nameOf = {}
  ;(f.lifts || []).forEach(l => { nameOf[l.key] = l.name })
  const bestOf = {}
  Object.keys(f.bestLift || {}).forEach(k => {
    const b = f.bestLift[k]
    if (b && b.oneRM) bestOf[k] = b.oneRM
  })
  return (f.strengthHistory || []).map(s => ({
    id: s._id,
    liftName: nameOf[s.lift] || s.lift,
    date: s.date,
    weight: s.weight,
    reps: s.reps,
    oneRM: s.oneRM,
    isBest: bestOf[s.lift] != null && Number(bestOf[s.lift]) === Number(s.oneRM)
  }))
}

// 运动记录：把类型换成中文、拼出明细
function buildActivityList(f) {
  const nameOf = {}
  ;(f.actionTypes || []).forEach(t => { nameOf[t.key] = t.name })
  const fallback = { walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳', strength: '力量训练', class: '团课', other: '其他' }
  return (f.activity || []).map(a => {
    const parts = []
    if (a.distance > 0) parts.push(a.distance + ' 公里')
    if (a.duration > 0) parts.push(a.duration + ' 分钟')
    if (a.steps > 0) parts.push(a.steps + ' 步')
    if (a.calories > 0) parts.push(a.calories + ' 千卡')
    return {
      id: a._id,
      typeName: nameOf[a.type] || fallback[a.type] || '运动',
      date: a.date,
      detail: parts.join(' · '),
      avgHr: a.avgHr || 0
    }
  })
}

Page({

  data: {
    id: '', f: null, loaded: false,
    // 三类录入拆成 tab：body / strength / activity
    tab: 'body', strengthList: [], activityList: [],
    genders: GENDERS, genderIndex: 2,
    lifts: [], liftIndex: 0, actionTypes: [], typeIndex: 0,
    segKeys: SEG_KEYS,
    showDevice: false,
    uploading: false,
    body: EMPTY_BODY,
    strength: EMPTY_STRENGTH,
    activity: EMPTY_ACTIVITY,
    currentType: null,
    currentFields: [],
    hintText: '',
    actDate: ''
  },

  onLoad(query) {
    // 支持从会员详情分别进入三个录入 tab：?tab=body|strength|activity
    const tab = ['body', 'strength', 'activity'].includes(query.tab) ? query.tab : 'body'
    this.setData({ id: query.id || '', tab })
    this.load()
  },

  // 三个录入 tab 之间切换：身体数据 / 力量成绩 / 运动记录
  pickTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.setData({ tab })
  },

  load() {
    return api.call('memberFitness', { openid: this.data.id }).then(f => {
      const types = (f && f.actionTypes && f.actionTypes.length) ? f.actionTypes : []
      const typeIndex = Math.min(this.data.typeIndex, Math.max(0, types.length - 1))
      const cur = types[typeIndex] || { name: '', desc: '', fields: [], strict: false, required: [] }
      this.actionTypes = types
      const gi = GENDERS.findIndex(g => g.value === (f.gender || ''))
      // 运动表单按类型动态生成字段；首次进入用当前选中的类型
      const act = {}
      ;(cur.fields || []).forEach(x => { act[x.key] = this.data.activity[x.key] || '' })
      this.setData({
        loaded: true,
        f,
        lifts: f.lifts || [],
        actionTypes: types,
        typeIndex,
        currentType: cur,
        currentFields: cur.fields || [],
        hintText: hintOf(cur),
        strengthList: buildStrengthList(f),
        activityList: buildActivityList(f),
        activity: act,
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
          // 识别用的这张图，直接存成「体测报告照片」，不用再单独传一次
          this.setData({ 'body.reportImage': fileID })
          wx.showLoading({ title: '识别中', mask: true })
          return api.call('ocrBodyReport', { fileID }, { silent: true })
        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
          const tip = '已识别，报告照片已保存'
          this.setData({
            recognizeMsg: this.data.recognizeMsg ? this.data.recognizeMsg + '；' + tip : tip
          })
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
    const typeIndex = Number(e.detail.value)
    const types = this.actionTypes || this.data.actionTypes || []
    const cur = types[typeIndex]
    if (!cur) return
    const activity = {}
    cur.fields.forEach(f => { activity[f.key] = '' })
    this.setData({
      typeIndex,
      currentType: cur,
      currentFields: cur.fields,
      hintText: hintOf(cur),
      activity
    })
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
          sfx.playSave()
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
      sfx.playSave()
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
      sfx.playSave()
      wx.showToast({ title: '1RM 约 ' + r.oneRM + ' kg' })
      this.setData({ strength: EMPTY_STRENGTH })
      this.load()
    })
  },

  // 删除一条历史体测（误传时用）
  deleteBody(e) {
    const id = e.currentTarget.dataset.id
    const date = e.currentTarget.dataset.date || ''
    if (!id) return
    wx.showModal({
      title: '删除这条体测记录？',
      content: (date ? date + ' 的记录' : '这条记录') +
        '删除后不能恢复；会员档案里的「最新身体数据」会自动换成剩下最新的一条。',
      confirmText: '删除',
      confirmColor: '#e9603a',
      success: r => {
        if (!r.confirm) return
        api.call('deleteBodyRecord', { id }, { loading: '删除中' }).then(() => {
          sfx.playDelete()
          wx.showToast({ title: '已删除' })
          this.load()
        }, () => {})
      }
    })
  },

  submitActivity() {
    const cur = this.data.currentType
    if (!cur || !cur.fields) return wx.showToast({ title: '请先选择运动类型', icon: 'none' })
    const a = this.data.activity

    // 必填校验：单一必填类型要求那一项；多必填类型要求至少一项
    const filled = (cur.required || []).filter(k => Number(a[k]) > 0)
    if (!filled.length) {
      if (cur.strict) {
        const req = cur.fields.find(f => f.required)
        return wx.showToast({ title: '请填写' + (req ? req.label : '必填项'), icon: 'none' })
      }
      const names = (cur.required || []).map(k => {
        const f = cur.fields.find(x => x.key === k)
        return f ? f.label : k
      })
      return wx.showToast({ title: '请至少填写' + names.join('/') + '中的一项', icon: 'none' })
    }

    const payload = { openid: this.data.id, type: cur.key }
    cur.fields.forEach(f => {
      const v = a[f.key]
      if (v === '' || v === undefined || v === null) return
      payload[f.key] = Number(v)
    })

    api.call('saveActivity', payload, { loading: '保存中' }).then(() => {
      const empty = {}
      cur.fields.forEach(f => { empty[f.key] = '' })
      this.setData({ activity: empty })
      sfx.playSave()
      wx.showToast({ title: '已记录' })
      this.load()
    }, () => {})
  }
})
