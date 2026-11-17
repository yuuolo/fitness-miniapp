// 修正 submitStrength（带上视频）与历史列表（带 videoUrl）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/fitness/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// 1. submitStrength 整体替换
const from = `  submitStrength() {
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
  },`

const to = `  submitStrength() {
    const s = this.data.strength
    const lift = this.data.lifts[this.data.liftIndex]
    if (!lift) return wx.showToast({ title: '请选择动作', icon: 'none' })
    const payload = { openid: this.data.id, lift: lift.key, weight: Number(s.weight), reps: Number(s.reps) }
    // 附了视频就一起提交（视频已在 /api/video 按管理设定处理过）
    if (this.data.strengthVideo) {
      payload.videoUrl = this.data.strengthVideo
      if (this.data.strengthVideoThumb) payload.videoThumb = this.data.strengthVideoThumb
    }
    api.call('saveStrength', payload, { loading: '保存中' }).then(r => {
      sfx.playSave()
      wx.showToast({ title: '1RM 约 ' + r.oneRM + ' kg' })
      this.setData({
        strength: EMPTY_STRENGTH,
        strengthVideo: '',
        strengthVideoThumb: '',
        strengthVideoTip: ''
      })
      this.load()
    })
  },`

if (!t.includes(from)) {
  console.log('⚠ 未匹配 submitStrength')
} else {
  t = t.replace(from, to)
  console.log('✓ submitStrength 已带视频')
}

// 2. buildStrengthList 带 videoUrl
const fromHist = `    oneRM: s.oneRM,
    isBest: bestOf[s.lift] != null && Number(bestOf[s.lift]) === Number(s.oneRM)`
const toHist = `    oneRM: s.oneRM,
    videoUrl: s.videoUrl || '',
    isBest: bestOf[s.lift] != null && Number(bestOf[s.lift]) === Number(s.oneRM)`
if (t.includes(fromHist)) {
  t = t.replace(fromHist, toHist)
  console.log('✓ 历史列表带 videoUrl')
} else {
  console.log('  · 历史列表未匹配，检查 buildStrengthList')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
