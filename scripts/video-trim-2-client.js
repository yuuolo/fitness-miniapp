// 小程序：视频走专用上传（服务端自动裁切超时长）+ 发布页处理提示
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const BASE = 'https://gym.novrein.com'
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

// ---------- 1. api.js：uploadVideo ----------
edit('utils/api.js', t => {
  if (t.includes('function uploadVideo')) return t
  return t.replace(
    `function readFile(filePath) {`,
    `// 视频专用上传：wx.uploadFile 是流式发送，不受 wx.request 体积限制；
// 服务端会探测时长，超过「视频最长秒数」时自动裁切并告诉我们裁了多久
function uploadVideo(filePath) {
  const suffix = String((filePath.match(/\\.[a-zA-Z0-9]+$/) || ['.mp4'])[0]).replace(/^\\./, '')
  return login().then(code => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE + '/api/video?ext=' + encodeURIComponent(suffix) + '&code=' + encodeURIComponent(code),
      filePath,
      name: 'file',
      timeout: 180000,
      success: res => {
        let r = {}
        try { r = JSON.parse(res.data || '{}') } catch (e) { r = {} }
        if (r.code === 0) return resolve(r.data)
        reject(new Error(r.msg || '视频上传失败'))
      },
      fail: err => {
        console.error('uploadVideo', err)
        reject(new Error('视频上传失败，请检查网络后重试'))
      }
    })
  }))
}

function readFile(filePath) {`
  )
}, 'api.js 增加 uploadVideo')

// ---------- 2. post.js：长视频询问 + 自动裁切上传 ----------
edit('pages/moments/post/post.js', t => {
  if (t.includes('pushLongVideo')) return t

  // 2.1 chooseVideo：拿到文件后先探测时长
  t = t.replace(
    `      success: res => {
        const file = (res.tempFiles || [])[0]
        if (file) this.compressVideo(file)
      }`,
    `      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        // 先探测时长：超过限制就不再当场上传，交给服务端裁切（或让用户重选）
        wx.getVideoInfo({
          src: file.tempFilePath,
          success: info => {
            const realDuration = Math.round(info.duration || file.duration || 0)
            const lim = this.lim()
            if (realDuration > lim.maxDuration + 1) {
              return this.askTrim(file, realDuration)
            }
            this.compressVideo(Object.assign({}, file, { duration: realDuration }))
          },
          fail: () => this.compressVideo(file)
        })
      }`
  )

  // 2.2 新增：询问是否裁切 + 裁切上传
  t = t.replace(
    `  compressVideo(file) {`,
    `  // 视频超过限制：告诉用户，并给「只保留前 N 秒」的选择（裁切在服务端做）
  askTrim(file, duration) {
    const lim = this.lim()
    const rawMB = (file.size || 0) / 1024 / 1024
    wx.showModal({
      title: '视频超过 ' + lim.maxDuration + ' 秒',
      content: '这段视频 ' + duration + ' 秒。可以只保留前 ' + lim.maxDuration +
        ' 秒上传（越长的部分会被裁掉，原视频需要先传上去，请确保网络良好）' +
        (rawMB ? '，原视频约 ' + rawMB.toFixed(1) + 'MB' : ''),
      confirmText: '保留前' + lim.maxDuration + '秒',
      cancelText: '重新选',
      success: r => {
        if (!r.confirm) return
        this.trimUpload(file, duration)
      }
    })
  },

  // 服务端裁切上传：显示进度，完成后告诉用户裁掉了多少
  trimUpload(file, duration) {
    const lim = this.lim()
    wx.showLoading({ title: '上传并裁切中', mask: true })
    api.uploadVideo(file.tempFilePath).then(v => {
      wx.hideLoading()
      const item = {
        tempFilePath: file.tempFilePath,
        fileID: v.fileID,
        type: 'video',
        duration: Math.round(v.duration || lim.maxDuration),
        size: v.bytes || 0,
        thumbPath: file.thumbTempFilePath || '',
        trimmedFrom: v.trimmed ? Math.round(v.originalDuration || duration) : 0
      }
      if (!this.pushMedia(item)) return
      if (v.trimmed) {
        wx.showModal({
          title: '已自动裁切',
          content: '原视频 ' + Math.round(v.originalDuration || duration) + ' 秒，已保留前 ' +
            lim.maxDuration + ' 秒（' + fmtMB(v.bytes || 0) + '）。发布后其他会员看到的也是裁切后的版本。',
          showCancel: false
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showModal({
        title: '视频太长了',
        content: err.message || '处理失败，建议到相册里裁剪后再发，或重拍一段更短的。',
        showCancel: false
      })
    })
  },

  compressVideo(file) {`
  )

  // 2.3 uploadAll：已经传好的（长视频）不再重复上传
  t = t.replace(
    `    const tasks = media.map((m) => {
      return upload(m.tempFilePath).then(fileID => {`,
    `    const tasks = media.map((m) => {
      // 长视频已经在裁切接口里传好了，直接用返回的地址
      if (m.fileID) {
        const ready = { fileID: m.fileID, type: m.type, duration: m.duration || 0, size: m.size || 0 }
        if (m.type !== 'video' || !m.thumbPath) return Promise.resolve(ready)
        return upload(m.thumbPath)
          .then(thumb => Object.assign(ready, { thumb }))
          .catch(() => ready)
      }
      return upload(m.tempFilePath).then(fileID => {`
  )

  return t
}, 'post.js 长视频询问与裁切')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/api.js', 'pages/moments/post/post.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
