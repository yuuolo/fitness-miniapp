// 小程序请求封装：所有业务请求走自建后端
//
// 两套环境：
//   正式版（release）→ https://gym.novrein.com        正式库
//   体验版/开发版      → https://test-gym.novrein.com   测试库（独立数据，不影响会员）
// 判断依据：wx.getAccountInfoSync().miniProgram.envVersion
const BASE_RELEASE = 'https://gym.novrein.com'
const BASE_TEST = 'https://test-gym.novrein.com'

function pickBase() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    // develop（开发版）/ trial（体验版）一律走测试环境
    if (env === 'release') return BASE_RELEASE
    return BASE_TEST
  } catch (e) {
    return BASE_RELEASE
  }
}

const BASE = pickBase()

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

// 登录 code 只能用一次：服务端会话失效时要重新取 code，不能一直用旧的
function resetLogin() {
  cached = { code: '', at: 0 }
}

// 这些报错说明是 code 的问题，换一个新的再试
function isLoginError(msg) {
  return /code been used|登录失败|invalid code|已被使用|expired|会话/i.test(String(msg || ''))
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
  const send = () => login().then(code => request('/api', {
    data: { action, data: data || {}, code },
    loading: options && options.loading,
    silent: options && options.silent
  }))
  return send().catch(err => {
    if (!isLoginError(err && err.message)) throw err
    // 换一个新 code 重试一次；第二次还失败就把错误抛出去
    resetLogin()
    return send()
  })
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

// 视频专用上传：wx.uploadFile 是流式发送，不受 wx.request 体积限制；
// 服务端会探测时长，超过「视频最长秒数」时自动裁切并告诉我们裁了多久
function uploadVideo(filePath) {
  const suffix = String((filePath.match(/\.[a-zA-Z0-9]+$/) || ['.mp4'])[0]).replace(/^\./, '')
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

module.exports = { call, upload, resetLogin }
