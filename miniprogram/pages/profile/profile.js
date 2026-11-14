const api = require('../../utils/api')

Page({
  data: {
    avatar: '',
    nickName: '',
    phone: '',
    uploading: false,
    saving: false,
    first: false,
    gotPhone: false
  },

  onLoad(query) {
    this.setData({ first: (query || {}).first === '1' })
    // 打开就用服务端最新资料回填，保证「获取更新」
    api.call('home', {}, { silent: true }).then(res => {
      const me = (res && res.me) || {}
      this.setData({
        avatar: me.avatar || '',
        nickName: me.nickName || '',
        phone: me.phone || '',
        gotPhone: !!me.phone
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
      // 选完头像立刻保存，避免用户忘了点保存
      this.save({ silent: true })
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

  // 一键获取微信绑定手机号（需要小程序已认证）
  onGetPhone(e) {
    const detail = e.detail || {}
    if (!detail.code) {
      // 用户拒绝，或主体未认证 / 基础库不支持，都会走到这里
      const msg = String(detail.errMsg || '')
      if (msg.indexOf('deny') >= 0 || msg.indexOf('cancel') >= 0) {
        return wx.showToast({ title: '已取消授权', icon: 'none' })
      }
      return wx.showModal({
        title: '无法一键获取',
        content: '这个能力需要小程序完成微信认证。可以手动填写手机号，同样可以使用。',
        showCancel: false
      })
    }
    wx.showLoading({ title: '获取中', mask: true })
    api.call('bindPhone', { code: detail.code }, { silent: true }).then(me => {
      wx.hideLoading()
      this.setData({ phone: me.phone, gotPhone: true })
      wx.showToast({ title: '手机号已获取' })
      this.afterSaved()
    }, err => {
      wx.hideLoading()
      wx.showModal({
        title: '获取失败',
        content: (err && err.message ? err.message + '。' : '') + '可以直接手动填写手机号。',
        showCancel: false
      })
    })
  },

  save(options) {
    if (this.data.saving || this.data.uploading) return
    const opts = options || {}
    const nickName = String(this.data.nickName || '').trim()
    const phone = String(this.data.phone || '').trim()
    if (!nickName) {
      if (opts.silent) return
      return wx.showToast({ title: '请填写昵称', icon: 'none' })
    }
    if (!/^1\d{10}$/.test(phone)) {
      if (opts.silent) return
      return wx.showToast({ title: '请填写 11 位手机号', icon: 'none' })
    }

    this.setData({ saving: true })
    api.call('updateProfile', { nickName, phone, avatar: this.data.avatar }, opts.silent ? { silent: true } : { loading: '保存中' })
      .then(() => {
        this.setData({ saving: false })
        if (opts.silent) return
        this.afterSaved()
      }, () => this.setData({ saving: false }))
  },

  afterSaved() {
    wx.showToast({ title: '已保存' })
    setTimeout(() => this.back(), 600)
  },

  back() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/index/index' })
  },

  later() {
    this.back()
  }
})
