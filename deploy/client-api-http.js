// 小程序侧：把 wx.cloud.callFunction 换成 wx.request 的极小封装
// 用法与 utils/api.js 一致：call(action, data) → Promise
const BASE = 'https://api.example.com'

let cached = { code: '', at: 0 }

function login() {
  // code 有效期 5 分钟，提前 1 分钟就换新的
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

function call(action, data, options) {
  const opts = options || {}
  if (opts.loading) wx.showLoading({ title: opts.loading, mask: true })
  return login().then(code => new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/api',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { action, data: data || {}, code },
      success: res => {
        const r = res.data || {}
        if (r.code === 0) resolve(r.data)
        else reject(new Error(r.msg || '请求失败'))
      },
      fail: () => reject(new Error('网络异常，请稍后重试'))
    })
  })).catch(err => {
    if (!opts.silent) wx.showToast({ title: err.message, icon: 'none', duration: 2500 })
    throw err
  }).finally(() => {
    if (opts.loading) wx.hideLoading()
  })
}

module.exports = { call }
