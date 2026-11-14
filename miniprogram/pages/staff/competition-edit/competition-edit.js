const api = require('../../../utils/api')

function pad(n) { return String(n).padStart(2, '0') }
function dateOf(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function timeOf(ms) {
  const d = new Date(ms)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
function toMs(date, time) {
  return Date.parse(date + 'T' + String(time).slice(0, 5) + ':00')
}

Page({
  data: {
    id: '',
    lifts: [],
    liftIndex: 0,
    liftName: '选择项目',
    form: {
      title: '',
      desc: '',
      prize: '',
      rules: ''
    },
    startDate: '',
    startTime: '19:00',
    endDate: '',
    endTime: '21:00',
    saving: false
  },

  onLoad(query) {
    this.setData({ id: (query || {}).id || '' })
    const now = Date.now()
    this.setData({
      startDate: dateOf(now),
      startTime: timeOf(now + 3600e3),
      endDate: dateOf(now + 7 * 864e5),
      endTime: '21:00'
    })
    this.load()
  },

  load() {
    return api.call('listLiftItems', {}, { silent: true }).then(items => {
      const lifts = (items && items.items) || []
      this.setData({
        lifts,
        liftName: lifts.length ? lifts[0].name + '（' + lifts[0].unit + '）' : '没有可用项目'
      })
      if (!this.data.id) return
      return api.call('competitionDetail', { id: this.data.id }, { silent: true }).then(r => {
        const c = r.competition
        const idx = Math.max(lifts.findIndex(l => l.key === c.liftKey), 0)
        const picked = lifts[idx]
        this.setData({
          liftIndex: idx,
          liftName: picked ? picked.name + '（' + picked.unit + '）' : '没有可用项目',
          form: { title: c.title, desc: c.desc, prize: c.prize, rules: c.rules },
          startDate: dateOf(c.startAt),
          startTime: timeOf(c.startAt),
          endDate: dateOf(c.endAt),
          endTime: timeOf(c.endAt)
        })
      })
    }, err => wx.showToast({ title: err.message || '加载失败', icon: 'none' }))
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['form.' + key]: e.detail.value })
  },

  onLift(e) {
    const idx = Number(e.detail.value)
    const picked = this.data.lifts[idx]
    this.setData({
      liftIndex: idx,
      liftName: picked ? picked.name + '（' + picked.unit + '）' : '选择项目'
    })
  },

  onStartDate(e) { this.setData({ startDate: e.detail.value }) },
  onStartTime(e) { this.setData({ startTime: e.detail.value }) },
  onEndDate(e) { this.setData({ endDate: e.detail.value }) },
  onEndTime(e) { this.setData({ endTime: e.detail.value }) },

  save() {
    if (this.data.saving) return
    const f = this.data.form
    const lift = this.data.lifts[this.data.liftIndex]
    if (!lift) return wx.showToast({ title: '还没有可用的比赛项目', icon: 'none' })
    if (!String(f.title).trim()) return wx.showToast({ title: '请填写竞赛名称', icon: 'none' })

    const startAt = toMs(this.data.startDate, this.data.startTime)
    const endAt = toMs(this.data.endDate, this.data.endTime)
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      return wx.showToast({ title: '时间格式不对', icon: 'none' })
    }
    if (endAt <= startAt) return wx.showToast({ title: '结束时间要晚于开始时间', icon: 'none' })

    const payload = {
      title: f.title,
      desc: f.desc,
      prize: f.prize,
      rules: f.rules,
      liftKey: lift.key,
      startAt,
      endAt
    }
    if (this.data.id) payload._id = this.data.id

    this.setData({ saving: true })
    api.call('saveCompetition', payload, { loading: '保存中' }).then(r => {
      this.setData({ saving: false })
      wx.showToast({ title: this.data.id ? '已保存' : '已发起' })
      setTimeout(() => {
        if (this.data.id) wx.navigateBack()
        else wx.redirectTo({ url: '/pages/staff/competitions/competitions' })
      }, 600)
      return r
    }, () => this.setData({ saving: false }))
  }
})
