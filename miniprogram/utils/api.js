// 小程序请求封装：所有业务请求走自建后端 https://gym.novrein.com/api
// 用法与云开发版一致：call(action, data, options) → Promise；另外提供 upload(filePath, ext)
const BASE = 'https://gym.novrein.com'

let cached = { code: '', at: 0 }

// code 有效期 5 分钟，提前 1 分钟就换新的
function login() {
  if (cached.code && Date.now() - cached.at < 4 * 60e3) return Promise.resolve(cached.code)
  return new Promise((resolve, reject) => {
    wx.login({
      success: r => {
        cached = { code: r.code, at: Date.now() }
        resolve(r.code)
      },
      fail: reject
    })
  })
}

function request(path, options) {
  const opts = options || {}
  if (opts.loading) wx.showLoading({ title: opts.loading, mask: true })
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method: 'POST',
      timeout: 20000,
      header: opts.header || { 'content-type': 'application/json' },
      data: opts.data,
      success: res => {
        const r = res.data || {}
        if (r.code === 0) resolve(r.data)
        else reject(new Error(r.msg || '请求失败'))
      },
      fail: err => {
        console.error(path, err)
        reject(new Error('网络异常，请稍后重试'))
      },
      complete() {
        if (opts.loading) wx.hideLoading()
      }
    })
  }).catch(err => {
    if (!opts.silent) wx.showToast({ title: err.message, icon: 'none', duration: 2500 })
    throw err
  })
}

function call(action, data, options) {
  return login().then(code => request('/api', {
    data: { action, data: data || {}, code },
    loading: options && options.loading,
    silent: options && options.silent
  }))
}

// 上传本地文件，返回可直接放进 image/video 的 https 地址（代替云存储 fileID）
function upload(filePath, ext) {
  const suffix = String(ext || (filePath.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]).replace(/^\./, '')
  return Promise.all([login(), readFile(filePath)]).then(([code, buffer]) => request(
    '/api/upload?ext=' + encodeURIComponent(suffix) + '&code=' + encodeURIComponent(code),
    {
      data: buffer,
      header: { 'content-type': 'application/octet-stream' },
      silent: true
    }
  )).then(r => r.fileID)
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: r => resolve(r.data),
      fail: () => reject(new Error('读取文件失败'))
    })
  })
}

// 下载远程图片到本地临时路径（海报绘制需要本地路径）
function download(url) {
  if (!url) return Promise.resolve('')
  if (url.indexOf('http') !== 0) return Promise.resolve('')
  return new Promise(resolve => {
    wx.downloadFile({
      url,
      success: r => resolve(r.statusCode === 200 ? r.tempFilePath : ''),
      fail: () => resolve('')
    })
  })
}

module.exports = { call, upload, download, login, BASE }
