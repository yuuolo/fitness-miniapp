const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

const PAY_METHODS = [
  { value: 'wechat_qr', label: '微信收款码' },
  { value: 'alipay_qr', label: '支付宝收款码' },
  { value: 'cash', label: '现金' },
  { value: 'pos', label: 'POS 刷卡' },
  { value: 'free', label: '赠送' }
]
const ROLES = [
  { value: 'member', label: '会员' },
  { value: 'coach', label: '教练' },
  { value: 'staff', label: '前台' },
  { value: 'admin', label: '管理员' }
]

function prompt(title, placeholder) {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      success: r => (r.confirm ? resolve((r.content || '').trim()) : reject(new Error('cancel')))
    })
  })
}

Page({
  data: {
    isAdmin: false, member: null, cards: [], bookings: [], entries: [],
    types: [], payMethods: PAY_METHODS, roles: ROLES, roleIndex: 0,
    opening: false, form: { typeIndex: -1, amount: '', payIndex: 0, remark: '' }
  },

  onLoad(query) {
    this.id = query.id
    this.setData({ isAdmin: query.admin === '1' })
    this.load()
    api.call('listCardTypes').then(types => {
      this.setData({ types: types.filter(t => t.onSale).map(t => Object.assign(t, { label: t.name + '  ¥' + fmt.yuan(t.price) })) })
    })
  },

  load() {
    return api.call('memberDetail', { openid: this.id }).then(res => {
      this.setData({
        member: Object.assign(res.member, { since: fmt.fullDate(res.member.createdAt) }),
        roleIndex: Math.max(ROLES.findIndex(r => r.value === res.member.role), 0),
        cards: res.cards.map(fmt.decorateCard),
        bookings: res.bookings.map(fmt.decorateBooking),
        entries: res.entries.map(e => Object.assign(e, { time: fmt.dateTime(e.createdAt) }))
      })
    })
  },

  // ---------- 办卡 ----------

  toggleOpen() {
    this.setData({ opening: !this.data.opening })
  },

  onPick(e) {
    const field = e.currentTarget.dataset.field
    const patch = { ['form.' + field]: Number(e.detail.value) }
    if (field === 'typeIndex') {
      const t = this.data.types[Number(e.detail.value)]
      patch['form.amount'] = fmt.yuan(t.price)
    }
    this.setData(patch)
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  submitCard() {
    const f = this.data.form
    const type = this.data.types[f.typeIndex]
    if (!type) return wx.showToast({ title: '请选择卡种', icon: 'none' })
    const amount = Math.round(Number(f.amount) * 100)
    if (!(amount >= 0)) return wx.showToast({ title: '请填写实收金额', icon: 'none' })
    const pay = PAY_METHODS[f.payIndex]
    wx.showModal({
      title: '确认办卡',
      content: '为 ' + (this.data.member.nickName || '该会员') + ' 办理「' + type.name + '」，实收 ¥' + fmt.yuan(amount) + '（' + pay.label + '）',
      success: r => {
        if (!r.confirm) return
        api.call('openCard', {
          openid: this.id, typeId: type._id, amount, payMethod: pay.value, remark: f.remark
        }, { loading: '办理中' }).then(() => {
          wx.showToast({ title: '办卡成功' })
          this.setData({ opening: false, form: { typeIndex: -1, amount: '', payIndex: 0, remark: '' } })
          this.load()
        })
      }
    })
  },

  // ---------- 卡操作 ----------

  cardActions(e) {
    const card = this.data.cards[e.currentTarget.dataset.index]
    if (card.status === 'void') return
    const actions = []
    if (card.kind !== 'period') actions.push({ label: '调整次数', run: () => this.adjust(card, 'delta') })
    actions.push({ label: '延长/缩短有效期', run: () => this.adjust(card, 'extendDays') })
    if (card.status === 'active') actions.push({ label: '停卡（暂停计时）', run: () => this.setStatus(card, 'paused') })
    if (card.status === 'paused') actions.push({ label: '恢复使用', run: () => this.setStatus(card, 'active') })
    actions.push({ label: '作废（退卡）', run: () => this.setStatus(card, 'void') })
    wx.showActionSheet({
      itemList: actions.map(a => a.label),
      success: r => actions[r.tapIndex].run()
    })
  },

  adjust(card, field) {
    const isDelta = field === 'delta'
    let value
    prompt(isDelta ? '调整次数' : '调整有效期（天）', isDelta ? '如 2 表示加 2 次，-1 表示减 1 次' : '如 7 表示延长 7 天，-3 表示缩短')
      .then(v => {
        value = Number(v)
        if (!Number.isInteger(value) || value === 0) throw new Error('请输入非零整数')
        return prompt('调整原因', '必填，如：赔偿、录入错误')
      })
      .then(remark => api.call('adjustCard', { cardId: card._id, [field]: value, remark }, { loading: '保存中' }))
      .then(() => {
        wx.showToast({ title: '已调整' })
        this.load()
      })
      .catch(err => {
        if (err.message !== 'cancel' && err.message.indexOf('整数') >= 0) wx.showToast({ title: err.message, icon: 'none' })
      })
  },

  setStatus(card, status) {
    const names = { paused: '停卡', active: '恢复', void: '作废' }
    wx.showModal({
      title: names[status],
      content: status === 'void' ? '作废后不可恢复，退款请线下处理并记录。确定作废「' + card.name + '」？' : '确定' + names[status] + '「' + card.name + '」？',
      confirmColor: status === 'void' ? '#d93a3a' : '#ff6a3d',
      success: r => {
        if (!r.confirm) return
        api.call('setCardStatus', { cardId: card._id, status }, { loading: '处理中' }).then(() => {
          wx.showToast({ title: '已' + names[status] })
          this.load()
        })
      }
    })
  },

  // ---------- 角色 ----------

  changeRole(e) {
    const role = ROLES[Number(e.detail.value)]
    wx.showModal({
      title: '修改角色',
      content: '把该用户设为「' + role.label + '」？教练可看自己的课并签到，前台可办卡核销，管理员拥有全部权限。',
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
