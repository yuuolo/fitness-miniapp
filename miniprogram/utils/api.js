// 所有业务请求都走云函数 api，按 action 路由
function call(action, data, options) {
  const opts = options || {}
  if (opts.loading) wx.showLoading({ title: opts.loading, mask: true })
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, data: data || {} },
      success(res) {
        const r = res.result || {}
        if (r.code === 0) resolve(r.data)
        else reject(new Error(r.msg || '请求失败'))
      },
      fail(err) {
        reject(new Error('网络异常，请稍后重试'))
        console.error(action, err)
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

module.exports = { call }
