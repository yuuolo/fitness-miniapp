const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

function emptyForm() {
  return { _id: '', name: '', desc: '', openHour: '10', closeHour: '22', capacity: '1', price: '', onSale: true }
}

Page({
  data: { isAdmin: false, list: [], editing: false, form: emptyForm() },

  onLoad(query) {
    this.setData({ isAdmin: query.admin === '1' })
    this.load()
  },

  load() {
    return api.call('listAllVenues').then(list => {
      this.setData({ list: list.map(v => Object.assign(v, { priceText: fmt.yuan(v.price) })) })
    })
  },

  add() {
    this.setData({ editing: true, form: emptyForm() })
  },

  edit(e) {
    if (!this.data.isAdmin) return
    const v = this.data.list[e.currentTarget.dataset.index]
    this.setData({
      editing: true,
      form: {
        _id: v._id, name: v.name, desc: v.desc, openHour: String(v.openHour), closeHour: String(v.closeHour),
        capacity: String(v.capacity), price: fmt.yuan(v.price), onSale: v.onSale
      }
    })
  },

  close() {
    this.setData({ editing: false })
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onSale(e) {
    this.setData({ 'form.onSale': e.detail.value })
  },

  save() {
    const f = this.data.form
    api.call('saveVenue', {
      _id: f._id || undefined,
      name: f.name,
      desc: f.desc,
      openHour: Number(f.openHour),
      closeHour: Number(f.closeHour),
      capacity: Number(f.capacity),
      price: Math.round(Number(f.price) * 100),
      onSale: f.onSale
    }, { loading: '保存中' }).then(() => {
      wx.showToast({ title: '已保存' })
      this.setData({ editing: false })
      this.load()
    })
  }
})
