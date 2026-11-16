const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const fmt = require('../../../utils/format')

// 角色只有三级（原「前台」已移除）
const ROLES = [
  { value: 'member', label: '会员' },
  { value: 'coach', label: '教练' },
  { value: 'admin', label: '管理员' }
]

Page({

  data: {
    isAdmin: false,
    manage: false,
    member: null,
    roles: ROLES,
    roleIndex: 0,
    editingProfile: false,
    profileForm: { nickName: '', phone: '', gender: '', height: '' },
    genderOptions: [{ value: '', label: '不填' }, { value: 'male', label: '男' }, { value: 'female', label: '女' }],
    genderIndex: 0
  },

  onLoad(query) {
    const q = query || {}
    this.id = q.id
    this.setData({ isAdmin: q.admin === '1', manage: q.manage === '1' })
    // 允许右上角「···」转发这个会员的资料
    wx.showShareMenu({ menus: ['shareAppMessage'] })
    this.load()
  },

  load() {
    return api.call('memberDetail', { openid: this.id }).then(res => {
      const genderIndex = Math.max(
        this.data.genderOptions.findIndex(g => g.value === (res.member.gender || '')),
        0
      )
      this.setData({
        member: Object.assign(res.member, { since: fmt.fullDate(res.member.createdAt) }),
        roleIndex: Math.max(ROLES.findIndex(r => r.value === res.member.role), 0),
        genderIndex,
        profileForm: {
          nickName: res.member.nickName || '',
          phone: res.member.phone || '',
          gender: res.member.gender || '',
          height: res.member.height || ''
        }
      })
    }, err => wx.showToast({ title: err.message || '加载失败', icon: 'none' }))
  },

  // ---------- 代填资料（仅管理员；教练没有这个权限） ----------

  toggleProfile() {
    if (!this.data.manage) return
    this.setData({ editingProfile: !this.data.editingProfile })
  },

  onProfileInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['profileForm.' + key]: e.detail.value })
  },

  onGender(e) {
    const idx = Number(e.detail.value)
    this.setData({
      genderIndex: idx,
      'profileForm.gender': this.data.genderOptions[idx].value
    })
  },

  saveProfile() {
    if (!this.data.manage) {
      return wx.showToast({ title: '只有管理员能修改资料', icon: 'none' })
    }
    const f = this.data.profileForm
    const payload = { openid: this.id, nickName: f.nickName, phone: f.phone, gender: f.gender }
    if (f.height !== '' && f.height !== null) payload.height = Number(f.height)
    api.call('staffUpdateProfile', payload, { loading: '保存中' }).then(() => {
      sfx.playSave()
      wx.showToast({ title: '已保存' })
      this.setData({ editingProfile: false })
      this.load()
    })
  },

  // ---------- 身体数据 ----------

  // 转发这个会员的资料给朋友（对方打开是公开资料页，看不到手机号）
  onShareAppMessage() {
    const m = this.data.member || {}
    const latest = m.latestBody || {}
    return {
      title: (m.nickName || '会员') + ' 的身体数据' +
        (latest.score != null ? ' · ' + latest.score + ' 分' : ''),
      path: '/pages/member/member?openid=' + encodeURIComponent(this.id || ''),
      imageUrl: latest.reportImage || ''
    }
  },

  // 点「转发这份资料」那一行时的提示（真正的转发走按钮的 open-type）
  shareHint() {
    wx.showToast({ title: '点右边的「转发」按钮', icon: 'none' })
  },

  // 看 TA 的公开资料页（只读，含和我的身体数据 PK）
  goPublicProfile() {
    if (!this.id) return
    wx.navigateTo({ url: '/pages/member/member?openid=' + this.id })
  },

  goFitness() {
    wx.navigateTo({ url: '/pages/staff/fitness/fitness?id=' + this.id })
  },

  // ---------- 角色（仅管理员） ----------

  changeRole(e) {
    const role = ROLES[Number(e.detail.value)]
    wx.showModal({
      title: '修改角色',
      content: '把该用户设为「' + role.label + '」？教练可查会员、录体测、管理竞赛；管理员拥有全部权限。',
      success: r => {
        if (!r.confirm) return
        api.call('setRole', { openid: this.id, role: role.value }, { loading: '保存中' }).then(() => {
          wx.showToast({ title: '已修改' })
          this.load()
        })
      }
    })
  }
})
