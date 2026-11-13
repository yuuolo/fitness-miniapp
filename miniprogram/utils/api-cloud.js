// 云开发版请求封装（迁移前备份，保留用于回滚）
// 用法：把页面里的 require('../../utils/api') 换回本文件即可继续走 wx.cloud.callFunction
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

// 云存储上传（迁移后由 utils/api.js 的 upload 代替）
function upload(filePath, ext) {
  const suffix = String(ext || (filePath.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]).replace(/^\./, '')
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath: 'uploads/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + suffix,
      filePath,
      success: res => resolve(res.fileID),
      fail: () => reject(new Error('文件上传失败'))
    })
  })
}

function download(fileID) {
  if (!fileID) return Promise.resolve('')
  return new Promise(resolve => {
    wx.cloud.downloadFile({
      fileID,
      success: r => resolve(r.tempFilePath),
      fail: () => resolve('')
    })
  })
}

module.exports = { call, upload, download }
