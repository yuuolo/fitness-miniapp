// 体测录入页：增加「从报告图/文字识别」入口
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

// ---------- js ----------
const jsPath = MP + '/pages/staff/fitness/fitness.js'
let js = fs.readFileSync(jsPath, 'utf8')

// data 增加识别相关状态
js = js.replace(
  `    showDevice: false,
    uploading: false,`,
  `    showDevice: false,
    uploading: false,
    // 体测报告识别
    showRecognize: false,
    reportText: '',
    recognizeMsg: '',
    recognizing: false,`
)

// 方法：展开/收起、粘贴解析、图片识别、把解析结果填进表单
const METHODS = `
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

`

// 插到 toggleDevice 之前
const anchor = '  toggleDevice() {'
if (!js.includes(anchor)) throw new Error('找不到 toggleDevice')
js = js.replace(anchor, METHODS + anchor)
fs.writeFileSync(jsPath, js)
console.log('staff/fitness.js 已加入识别逻辑')

// ---------- wxml ----------
const wxmlPath = MP + '/pages/staff/fitness/fitness.wxml'
let wxml = fs.readFileSync(wxmlPath, 'utf8')

const BLOCK = `  <!-- 从体测报告识别 -->
  <view class="card">
    <view class="between" bindtap="toggleRecognize">
      <view>
        <view class="title">从体测报告识别</view>
        <view class="muted">支持小米八电极体脂秤等设备的报告图，自动填入下方表单</view>
      </view>
      <text class="muted">{{showRecognize ? '收起' : '展开 ›'}}</text>
    </view>

    <block wx:if="{{showRecognize}}">
      <button class="btn ghost block mt" bindtap="chooseAndOcr" disabled="{{recognizing}}">
        {{recognizing ? '识别中…' : '选择报告图识别'}}
      </button>

      <view class="muted mt">没有配置识别服务？用微信打开报告图 →「提取文字」→ 粘贴到下面：</view>
      <textarea class="textarea" value="{{reportText}}" bindinput="onReportText"
        maxlength="8000" placeholder="把报告文字粘贴到这里，例如：体重 80.25kg 体脂率 27.6% …" />
      <button class="btn block mt" bindtap="parseReportText" disabled="{{recognizing}}">解析文字</button>

      <view wx:if="{{recognizeMsg}}" class="note-center">{{recognizeMsg}}</view>
    </block>
  </view>

`

// 插到第一个 card（身体数据表单）之前
const firstCard = wxml.indexOf('<view class="card"')
if (firstCard < 0) throw new Error('找不到 card')
wxml = wxml.slice(0, firstCard) + BLOCK + wxml.slice(firstCard)
fs.writeFileSync(wxmlPath, wxml)
console.log('staff/fitness.wxml 已加入识别卡片')
