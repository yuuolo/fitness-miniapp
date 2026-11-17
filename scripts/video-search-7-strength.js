// 力量成绩：可拍/选视频（走 /api/video，自动按管理设定裁切压缩）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// ---------- 1. 员工端 wxml：表单加视频，历史加播放 ----------
edit('pages/staff/fitness/fitness.wxml', t => {
  const from = `    <view class="form-row"><text class="label">次数</text><input type="number" value="{{strength.reps}}" data-field="reps" bindinput="onStrengthInput" placeholder="如 5，1 次为实测" /></view>
    <button class="btn block mt" bindtap="submitStrength">保存成绩</button>
    <view class="muted mt">用 Epley 公式换算 1RM：重量 × (1 + 次数 ÷ 30)</view>`
  const to = `    <view class="form-row"><text class="label">次数</text><input type="number" value="{{strength.reps}}" data-field="reps" bindinput="onStrengthInput" placeholder="如 5，1 次为实测" /></view>

    <!-- 可选：给这条成绩附一段视频（留档、防争议），限制按管理页设定，超时长自动裁切 -->
    <view class="form-row">
      <text class="label">视频</text>
      <view class="grow row" style="justify-content:flex-end;gap:12rpx">
        <button wx:if="{{!strengthVideo}}" class="btn ghost sm" bindtap="chooseStrengthVideo" disabled="{{videoUploading}}">
          {{videoUploading ? '上传中…' : '拍摄 / 选择'}}
        </button>
        <block wx:else>
          <text class="tag orange">已附视频</text>
          <button class="btn gray sm" bindtap="previewStrengthVideo">预览</button>
          <button class="btn gray sm" bindtap="clearStrengthVideo">移除</button>
        </block>
      </view>
    </view>
    <view wx:if="{{strengthVideoTip}}" class="muted">{{strengthVideoTip}}</view>

    <button class="btn block mt" bindtap="submitStrength">保存成绩</button>
    <view class="muted mt">用 Epley 公式换算 1RM：重量 × (1 + 次数 ÷ 30)</view>`
  if (!t.includes(from)) throw new Error('找不到力量成绩表单')
  t = t.replace(from, to)

  // 历史行加视频
  const histFrom = `        <text wx:if="{{item.isBest}}" class="tag orange">最好</text>`
  const histTo = `        <text wx:if="{{item.isBest}}" class="tag orange">最好</text>
        <text wx:if="{{item.videoUrl}}" class="tag" data-src="{{item.videoUrl}}" catchtap="playStrengthVideo">▶ 视频</text>`
  if (!t.includes(histFrom)) throw new Error('找不到历史行标记')
  t = t.replace(histFrom, histTo)
  return t
}, '员工端力量视频 UI')

// ---------- 2. 员工端 js ----------
edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('chooseStrengthVideo')) return t

  // data 增加视频状态
  t = t.replace(
    `    strength: EMPTY_STRENGTH,`,
    `    strength: EMPTY_STRENGTH,
    strengthVideo: '',
    strengthVideoThumb: '',
    strengthVideoTip: '',
    videoUploading: false,`
  )

  // 方法
  t = t.replace(
    `  submitStrength() {`,
    `  // 力量成绩附视频：走 /api/video，服务端按管理设定裁切/压缩，超限会被拒
  chooseStrengthVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      camera: 'back',
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        this.setData({ videoUploading: true, strengthVideoTip: '上传中，超时长的视频会被自动裁切…' })
        wx.showLoading({ title: '上传并处理中', mask: true })
        api.uploadVideo(file.tempFilePath).then(v => {
          wx.hideLoading()
          this.setData({
            strengthVideo: v.fileID,
            strengthVideoThumb: '',
            videoUploading: false,
            strengthVideoTip: v.trimmed
              ? '原视频 ' + Math.round(v.originalDuration) + ' 秒，已按管理设定裁到前 ' + v.keptSeconds +
                ' 秒（' + (v.bytes / 1024 / 1024).toFixed(1) + 'MB）'
              : '已上传（' + (v.bytes / 1024 / 1024).toFixed(1) + 'MB）'
          })
        }).catch(err => {
          wx.hideLoading()
          this.setData({ videoUploading: false, strengthVideoTip: '' })
          wx.showModal({
            title: '视频没传上去',
            content: err.message || '请检查网络或视频大小（限制见管理页设定）',
            showCancel: false
          })
        })
      }
    })
  },

  clearStrengthVideo() {
    this.setData({ strengthVideo: '', strengthVideoThumb: '', strengthVideoTip: '' })
  },

  previewStrengthVideo() {
    const src = this.data.strengthVideo
    if (!src) return
    wx.previewMedia({ sources: [{ url: src, type: 'video' }] })
  },

  // 历史里那条成绩的视频
  playStrengthVideo(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewMedia({ sources: [{ url: src, type: 'video' }] })
  },

  submitStrength() {`
  )

  // 提交时带上视频 + 清空
  t = t.replace(
    `    return api.call('saveStrength', payload, { loading: '保存中' }).then(() => {`,
    `    if (this.data.strengthVideo) {
      payload.videoUrl = this.data.strengthVideo
      if (this.data.strengthVideoThumb) payload.videoThumb = this.data.strengthVideoThumb
    }
    return api.call('saveStrength', payload, { loading: '保存中' }).then(() => {`
  )
  t = t.replace(
    `      wx.showToast({ title: '已保存' })`,
    `      wx.showToast({ title: '已保存' })
      this.setData({ strengthVideo: '', strengthVideoThumb: '', strengthVideoTip: '' })`
  )

  // 历史列表带上视频字段
  t = t.replace(
    `    oneRM: s.oneRM,
    isBest:`,
    `    oneRM: s.oneRM,
    videoUrl: s.videoUrl || '',
    isBest:`
  )
  return t
}, '员工端力量视频逻辑')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/fitness/fitness.js'])
console.log('  ✓ 语法通过')
