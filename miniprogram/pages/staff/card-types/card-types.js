const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

const KINDS = [
  { value: 'period', label: '期限卡（不限次）' },
  { value: 'times', label: '次卡（每天入场扣 1 次）' },
  { value: 'lesson', label: '私教课包（上课扣次）' }
]

function emptyForm() {
  return { _id: '', name: '', kindIndex: 0, times: '10', days: '30', price: '', desc: '', onSale: true }
}

Page({
  data: { isAdmin: false, list: [], kinds: KINDS, editing: false, form: emptyForm() },

  onLoad(query) {
    this.setData({ isAdmin: query.admin === '1' })
    this.load()
  },

  load() {
    return api.call('listCardTypes').then(list => {
      this.setData({
        list: list.map(t => Object.assign(t, {
          kindName: fmt.CARD_KINDS[t.kind],
          priceText: fmt.yuan(t.price),
          rule: t.kind === 'period' ? t.days + ' 天不限次' : t.times + ' 次 · ' + t.days + ' 天有效'
        }))
      })
    })
  },

  add() {
    this.setData({ editing: true, form: emptyForm() })
  },

  edit(e) {
    if (!this.data.isAdmin) return
    const t = this.data.list[e.currentTarget.dataset.index]
    this.setData({
      editing: true,
      form: {
        _id: t._id, name: t.name, kindIndex: KINDS.findIndex(k => k.value === t.kind),
        times: String(t.times || ''), days: String(t.days), price: fmt.yuan(t.price), desc: t.desc, onSale: t.onSale
      }
    })
  },

  close() {
    this.setData({ editing: false })
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onKind(e) {
    this.setData({ 'form.kindIndex': Number(e.detail.value) })
  },

  onSale(e) {
    this.setData({ 'form.onSale': e.detail.value })
  },

  save() {
    const f = this.data.form
    api.call('saveCardType', {
      _id: f._id || undefined,
      name: f.name,
      kind: KINDS[f.kindIndex].value,
      times: Number(f.times),
      days: Number(f.days),
      price: Math.round(Number(f.price) * 100),
      desc: f.desc,
      onSale: f.onSale
    }, { loading: '保存中' }).then(() => {
      wx.showToast({ title: '已保存' })
      this.setData({ editing: false })
      this.load()
    })
  }
})
