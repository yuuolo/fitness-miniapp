// 竞赛录入的视频也走 /api/video（统一遵循管理设定的裁切/压缩）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/competition-entry/competition-entry.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        if (file.size > 12 * 1024 * 1024) {
          return wx.showToast({ title: '视频超过 12MB，请裁剪后重试', icon: 'none' })
        }
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传中', mask: true })
        api.upload(file.tempFilePath, 'mp4').then(url => {
          wx.hideLoading()
          this.setData({ videoUrl: url, uploading: false })
          wx.showToast({ title: '视频已上传' })
        }, () => {
          wx.hideLoading()`

// 只取到 catch 之前的公共部分做精确替换比较难，直接按行号区间替换整个方法
const lines = t.split('\n')
const start = lines.findIndex(l => l.indexOf('chooseVideo() {') >= 0)
if (start < 0) {
  console.log('⚠ 找不到 chooseVideo')
  process.exit(1)
}
// 找到方法结尾：从 start 开始往下找缩进为两个空格的 "  },"
let end = -1
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i] === '  },') { end = i; break }
}
if (end < 0) {
  console.log('⚠ 找不到方法结尾')
  process.exit(1)
}
console.log('替换行 ' + (start + 1) + ' ~ ' + (end + 1))

const newLines = [
  '  chooseVideo() {',
  '    wx.chooseMedia({',
  '      count: 1,',
  "      mediaType: ['video'],",
  "      sourceType: ['album', 'camera'],",
  '      maxDuration: 60,',
  '      success: res => {',
  '        const file = (res.tempFiles || [])[0]',
  '        if (!file) return',
  '        this.setData({ uploading: true })',
  "        wx.showLoading({ title: '上传并处理中', mask: true })",
  '        // 统一走 /api/video：按管理页设定限制时长/体积，超时长自动裁切',
  '        api.uploadVideo(file.tempFilePath).then(v => {',
  '          wx.hideLoading()',
  '          this.setData({ videoUrl: v.fileID, uploading: false })',
  '          if (v.trimmed) {',
  '            wx.showModal({',
  "              title: '已自动裁切',",
  "              content: '原视频 ' + Math.round(v.originalDuration) + ' 秒，已保留前 ' +",
  "                v.keptSeconds + ' 秒（' + (v.bytes / 1024 / 1024).toFixed(1) + 'MB）。',",
  '              showCancel: false',
  '            })',
  '          } else {',
  "            wx.showToast({ title: '视频已上传' })",
  '          }',
  '        }).catch(err => {',
  '          wx.hideLoading()',
  '          this.setData({ uploading: false })',
  '          wx.showModal({',
  "            title: '视频没传上去',",
  "            content: err.message || '请检查网络或视频大小（限制见管理页设定）',",
  '            showCancel: false',
  '          })',
  '        })',
  '      }',
  '    })',
  '  },'
]

lines.splice(start, end - start + 1, ...newLines)
t = lines.join('\n')
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 竞赛视频改走 /api/video')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
