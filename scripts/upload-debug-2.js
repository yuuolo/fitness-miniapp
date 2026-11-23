// 修：导出 uploadLimits；重试逻辑改为每个文件独立
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(p, fn, label) {
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

// 1. moment.js 导出
edit(SERVER + '/lib/moment.js', t => t.replace(
  `  momentPoster, momentByShort, setPosterQr
}`,
  `  momentPoster, momentByShort, setPosterQr, uploadLimits
}`
), 'moment.js：导出 uploadLimits')

// 2. 重试逻辑改成每个文件独立一次
edit(MP + '/pages/challenges/detail/detail.js', t => {
  const from = `  doUploadOne(file, sideOpenid, files, index) {
    wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + files.length, mask: true })
    const payload = { id: this.data.id, videoUrl: '' }
    if (sideOpenid) payload.forOpenid = sideOpenid
    api.uploadVideo(file.tempFilePath).then(v => {
      payload.videoUrl = v.fileID
      return api.call('submitChallengeVideo', payload, { silent: true }).then(() => {
        if (v.trimmed) {
          wx.showToast({ title: '第 ' + (index + 1) + ' 段按设定裁到 ' + v.keptSeconds + ' 秒', icon: 'none' })
        }
        this.uploadQueue(files, sideOpenid, index + 1)
      })
    }).catch(err => {
      this._retry = (this._retry || 0) + 1
      if (this._retry === 1) {
        // 网络抖动很常见，自动重试一次
        wx.showToast({ title: '网络不稳，重试中…', icon: 'none' })
        return this.doUploadOne(file, sideOpenid, files, index, true)
      }
      this._retry = 0
      wx.hideLoading()
      wx.showModal({
        title: '视频上传失败',
        content: (err.message || '请稍后重试') +
          (files.length > 1 ? '（已成功 ' + index + '/' + files.length + ' 段）' : ''),
        showCancel: false
      })
      if (index > 0) this.load()
    })
  },`

  const to = `  doUploadOne(file, sideOpenid, files, index, isRetry) {
    wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + files.length, mask: true })
    const payload = { id: this.data.id, videoUrl: '' }
    if (sideOpenid) payload.forOpenid = sideOpenid
    api.uploadVideo(file.tempFilePath).then(v => {
      payload.videoUrl = v.fileID
      return api.call('submitChallengeVideo', payload, { silent: true }).then(() => {
        if (v.trimmed) {
          wx.showToast({ title: '第 ' + (index + 1) + ' 段按设定裁到 ' + v.keptSeconds + ' 秒', icon: 'none' })
        }
        this.uploadQueue(files, sideOpenid, index + 1)
      })
    }).catch(err => {
      // 每个文件最多自动重试一次（网络抖动很常见）
      if (!isRetry) {
        wx.showToast({ title: '网络不稳，重试中…', icon: 'none' })
        return this.doUploadOne(file, sideOpenid, files, index, true)
      }
      wx.hideLoading()
      wx.showModal({
        title: '视频上传失败',
        content: (err.message || '请稍后重试') +
          (files.length > 1 ? '（已成功 ' + index + '/' + files.length + ' 段）' : ''),
        showCancel: false
      })
      if (index > 0) this.load()
    })
  },`

  return t.includes(from) ? t.replace(from, to) : t
}, '详情页：每个文件重试一次')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/lib/moment.js'])
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/challenges/detail/detail.js'])
console.log('  ✓ 语法通过')
