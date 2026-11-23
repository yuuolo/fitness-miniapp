// 小程序请求封装：所有业务请求走自建后端
//
// 两套环境：
//   正式版（release）→ https://gym.novrein.com        正式库
//   体验版/开发版      → https://test-gym.novrein.com   测试库（独立数据，不影响会员）
// 判断依据：wx.getAccountInfoSync().miniProgram.envVersion
const BASE_RELEASE = 'https://gym.novrein.com'
// 测试环境挂在老域名下用路径区分：老域名解析稳定，微信上传不会报 DNS 失败
const BASE_TEST = 'https://gym.novrein.com/test-api'

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

// ---------- 视频上传：完全按后台「上传与展示限制」执行 ----------
// 后台设定（管理页 → 上传与展示限制）：
//   maxRawVideoMB  原视频（裁切前）上限，超过就直接拒绝并提示裁剪
//   maxVideoMB     压缩后（裁切后）目标体积；超过就压
//   maxDuration    视频最长秒数；超过由服务端自动裁切
//   maxCount       单条最多照片/视频数量
//   maxTotalMB     单条合计大小上限
// 0 = 不限
const POLICY_TTL = 5 * 60 * 1000
let policyCache = { at: 0, value: null }

function uploadPolicy() {
  if (policyCache.value && Date.now() - policyCache.at < POLICY_TTL) {
    return Promise.resolve(policyCache.value)
  }
  return call('uploadLimits', {}, { silent: true }).then(v => {
    policyCache = { at: Date.now(), value: v || {} }
    return policyCache.value
  }, () => ({}))
}

function fileSizeMB(filePath) {
  return new Promise(resolve => {
    try {
      wx.getFileInfo({
        filePath,
        success: r => resolve((r.size || 0) / 1024 / 1024),
        fail: () => resolve(0)
      })
    } catch (e) {
      resolve(0)
    }
  })
}

// 压缩视频（不支持时返回原路径）
function compressVideo(filePath, quality) {
  return new Promise(resolve => {
    if (!wx.compressVideo) return resolve({ path: filePath, compressed: false })
    wx.compressVideo({
      src: filePath,
      quality: quality || 'medium',
      success: r => resolve({ path: r.tempFilePath || filePath, compressed: !!r.tempFilePath }),
      fail: () => resolve({ path: filePath, compressed: false })
    })
  })
}

/**
 * 视频上传：先按后台策略检查/压缩，再流式上传
 * opts.duration 可选（chooseMedia 返回的时长，用来提示是否会裁切）
 * 返回 { fileID, trimmed, keptSeconds, originalDuration, compressed }
 */
function uploadVideo(filePath, opts) {
  const options = opts || {}
  return uploadPolicy().then(policy => {
    const maxRaw = Number(policy.maxRawVideoMB) || 0   // 0 = 不限
    const maxVideo = Number(policy.maxVideoMB) || 0    // 0 = 不限
    const maxDuration = Number(policy.maxDuration) || 0

    return fileSizeMB(filePath).then(sizeMB => {
      // 1) 原视频就超过「裁切前上限」→ 直接提示先裁剪（别再白传）
      if (maxRaw > 0 && sizeMB > maxRaw) {
        const err = new Error('这个视频 ' + sizeMB.toFixed(1) + 'MB，超过原视频上限 ' + maxRaw +
          'MB，请先在相册裁剪短一点再上传')
        err.tooLarge = true
        throw err
      }

      // 2) 超过「压缩后目标体积」→ 压缩（大文件用低质量，尽量一次到位）
      const needCompress = maxVideo > 0 && sizeMB > maxVideo
      if (!needCompress) return { path: filePath, compressed: false }

      const quality = sizeMB > maxVideo * 4 ? 'low' : 'medium'
      return compressVideo(filePath, quality).then(r => {
        if (!r.compressed) return r
        return fileSizeMB(r.path).then(after => {
          // 压完还超目标体积也不拦：服务端会再转码到目标体积
          return { path: r.path, compressed: true, sizeMB: after }
        })
      })
    }).then(source => {
      const finalPath = source.path
      const suffix = String((finalPath.match(/.[a-zA-Z0-9]+$/) || ['.mp4'])[0]).replace(/^./, '')
      // 超过最长秒数：告诉用户会被裁切（服务端执行）
      const willTrim = maxDuration > 0 && options.duration && options.duration > maxDuration + 1
      return login().then(code => new Promise((resolve, reject) => {
        wx.uploadFile({
          url: BASE + '/api/video?ext=' + encodeURIComponent(suffix) + '&code=' + encodeURIComponent(code),
          filePath: finalPath,
          name: 'file',
          timeout: 300000,
          success: res => {
            let r = {}
            try { r = JSON.parse(res.data || '{}') } catch (e) { r = {} }
            if (r.code === 0) {
              return resolve(Object.assign({}, r.data, {
                compressed: !!source.compressed,
                willTrim: !!willTrim
              }))
            }
            reject(new Error(r.msg || ('视频上传失败（HTTP ' + res.statusCode + '）')))
          },
          fail: err => {
            const raw = (err && err.errMsg) || '未知错误'
            console.error('uploadVideo fail:', raw)
            reject(new Error('视频上传失败（' + raw + '）'))
          }
        })
      }))
    })
  })
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

module.exports = { call, upload, uploadVideo, uploadPolicy, download, readFile, resetLogin }
