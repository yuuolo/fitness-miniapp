// 1) 后端：新增 uploadLimits（会员可读的上传限制）
// 2) 前端：上传失败带上微信原始错误 + 上传前检查体积/时长 + 失败重试一次
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

// ---------- 1. 后端 uploadLimits ----------
edit(SERVER + '/lib/moment.js', t => {
  if (t.includes('async function uploadLimits')) return t
  const block = `// 上传限制（只读，会员也能看）：前端在上传前先用它检查体积/时长
async function uploadLimits({ me }) {
  need(me, 'member')
  const cfg = await limits.get()
  return {
    maxDuration: cfg.maxDuration,
    maxVideoMB: cfg.maxVideoMB,
    maxRawVideoMB: cfg.maxRawVideoMB,
    maxTotalMB: cfg.maxTotalMB,
    maxCount: cfg.maxCount,
    feedThumbs: cfg.feedThumbs
  }
}

`
  // 插到模块导出之前
  const anchor = 'module.exports = {'
  if (!t.includes(anchor)) return t
  return t.replace(anchor, block + anchor).replace(/\n  uploadLimits,/, '\n  uploadLimits,')
    .replace(/(\n {2}momentList,)/, '\n  momentList,\n  uploadLimits,')
}, 'moment.js：uploadLimits')

// 注册 action（跟友圈同一个功能开关）
edit(SERVER + '/index.js', t => {
  if (t.includes('uploadLimits:')) return t
  return t.replace(/(\n {2}postMoment: '[^']*',)/, "$1\n  uploadLimits: 'moments',")
}, 'index.js：注册 uploadLimits')

// ---------- 2. 前端 api.js：错误信息带微信原始原因 ----------
edit(MP + '/utils/api.js', t => {
  const from = `      fail: err => {
        console.error('uploadVideo', err)
        reject(new Error('视频上传失败，请检查网络后重试'))
      }`
  const to = `      fail: err => {
        const raw = (err && err.errMsg) || '未知错误'
        console.error('uploadVideo fail:', raw)
        // 把微信的原始原因带出来，方便定位（域名/超时/体积/编码）
        reject(new Error('视频上传失败（' + raw + '）'))
      }`
  return t.includes(from) ? t.replace(from, to) : t
}, 'api.js：上传失败带上微信原始错误')

// ---------- 3. 详情页：上传前检查体积 + 失败重试一次 ----------
edit(MP + '/pages/challenges/detail/detail.js', t => {
  if (t.includes('checkUploadLimits')) return t

  // 增加限制缓存与检查方法
  t = t.replace(
    `  // 按顺序逐个上传（微信 uploadFile 同时只能一个，避免抢带宽）`,
    `  // 读取上传限制（只拉一次）
  checkUploadLimits() {
    if (this._limits) return Promise.resolve(this._limits)
    return api.call('uploadLimits', {}, { silent: true }).then(v => {
      this._limits = v || {}
      return this._limits
    }, () => ({}))
  },

  // 上传前检查体积/时长，避免白传几十兆再失败
  precheckVideo(file) {
    return this.checkUploadLimits().then(limits => {
      const maxRaw = Number(limits.maxRawVideoMB) || 0
      const sizeMB = file.size ? file.size / 1024 / 1024 : 0
      if (maxRaw > 0 && sizeMB > maxRaw) {
        return {
          ok: false,
          msg: '这个视频 ' + sizeMB.toFixed(1) + ' MB，超过单次上传上限 ' + maxRaw +
            ' MB。请在相册里裁剪短一点，或换成清晰度更低的版本再传。'
        }
      }
      const maxDuration = Number(limits.maxDuration) || 0
      if (maxDuration > 0 && file.duration && file.duration > maxDuration + 1) {
        // 超时长服务端会自动裁切，只提示不阻止
        wx.showToast({ title: '超时长会自动裁到 ' + maxDuration + ' 秒', icon: 'none' })
      }
      return { ok: true }
    })
  },

  // 按顺序逐个上传（微信 uploadFile 同时只能一个，避免抢带宽）`
  )

  // 在上传前插入检查
  t = t.replace(
    `    const file = files[index]
    wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + files.length, mask: true })`,
    `    const file = files[index]
    this.precheckVideo(file).then(chk => {
      if (chk && chk.ok === false) {
        wx.hideLoading()
        wx.showModal({ title: '视频太大', content: chk.msg, showCancel: false })
        return
      }
      this.doUploadOne(file, sideOpenid, files, index)
    })
  },

  // 单个文件上传（失败重试一次）
  doUploadOne(file, sideOpenid, files, index) {
    wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + files.length, mask: true })`
  )

  // 原 doUpload 主体（payload/api 调用）保持不变，只需把 catch 里重试一次
  t = t.replace(
    `    }).catch(err => {
      wx.hideLoading()
      wx.showModal({
        title: '视频提交失败',
        content: (err.message || '请稍后重试') + (index + 1 < files.length ? '（已成功 ' + index + ' 段）' : ''),
        showCancel: false
      })
      if (index > 0) this.load()
    })`,
    `    }).catch(err => {
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
    })`
  )
  return t
}, '详情页：体积检查 + 失败重试 + 原始错误')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/moment.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
for (const f of ['utils/api.js', 'pages/challenges/detail/detail.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
