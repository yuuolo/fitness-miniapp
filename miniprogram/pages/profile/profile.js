const api = require('../../utils/api')

Page({
  data: { avatar: '', nickName: '', phone: '', uploading: false, saving: false },

  onLoad() {
    api.call('home', {}, { silent: true }).then(res => {
      const me = (res && res.me) || {}
      this.setData({
        avatar: me.avatar || '',
        nickName: me.nickName || '',
        phone: me.phone || ''
      })
    }, () => {})
  },

  // 微信「头像昵称填写能力」：用户点一下才会把头像给到小程序
  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (!url) return
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中', mask: true })
    const ext = (url.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]
    api.upload(url, ext).then(fileID => {
      wx.hideLoading()
      this.setData({ avatar: fileID, uploading: false })
    }, () => {
      wx.hideLoading()
      this.setData({ uploading: false })
      wx.showToast({ title: '头像上传失败', icon: 'none' })
    })
  },

  onNick(e) {
    this.setData({ nickName: e.detail.value })
  },

  onPhone(e) {
    this.setData({ phone: e.detail.value })
  },

  save() {
    if (this.data.saving || this.data.uploading) return
    const nickName = String(this.data.nickName || '').trim()
    const phone = String(this.data.phone || '').trim()
    if (!nickName) return wx.showToast({ title: '请填写昵称', icon: 'none' })
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请填写 11 位手机号', icon: 'none' })

    this.setData({ saving: true })
    api.call('updateProfile', { nickName, phone, avatar: this.data.avatar }, { loading: '保存中' }).then(() => {
      this.setData({ saving: false })
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack(), 600)
    }, () => this.setData({ saving: false }))
  }
})
