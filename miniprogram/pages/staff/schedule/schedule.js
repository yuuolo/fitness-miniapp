const api = require('../../../utils/api')
const fmt = require('../../../utils/format')

const KINDS = [{ value: 'group', label: '团课' }, { value: 'private', label: '私教' }]

function emptyForm(date) {
  return { _id: '', courseName: '', kindIndex: 0, coachIndex: -1, date, time: '19:00', duration: '60', capacity: '20', room: '' }
}

Page({
  data: { isStaff: false, days: [], date: '', list: [], coaches: [], kinds: KINDS, editing: false, form: null },

  onLoad(query) {
    const days = fmt.nextDays(7)
    this.setData({ isStaff: query.staff === '1', days, date: days[0].date, form: emptyForm(days[0].date) })
    if (query.staff === '1') {
      api.call('listCoaches').then(coaches => this.setData({ coaches }))
    }
  },

  onShow() {
    this.load()
  },

  pickDate(e) {
    this.setData({ date: e.currentTarget.dataset.date })
    this.load()
  },

  load() {
    const date = this.data.date
    return api.call('staffSchedules', { date }).then(list => {
      if (date !== this.data.date) return
      this.setData({
        list: list.map(s => Object.assign(s, {
          time: fmt.hhmm(s.startAt) + '-' + fmt.hhmm(s.startAt + s.duration * 60000),
          kindName: s.kind === 'private' ? '私教' : '团课'
        }))
      })
    })
  },

  openRoster(e) {
    wx.navigateTo({ url: '/pages/staff/roster/roster?id=' + e.currentTarget.dataset.id })
  },

  newSchedule() {
    this.setData({ editing: true, form: emptyForm(this.data.date) })
  },

  editSchedule(e) {
    const s = this.data.list[e.currentTarget.dataset.index]
    this.setData({
      editing: true,
      form: {
        _id: s._id,
        courseName: s.courseName,
        kindIndex: s.kind === 'private' ? 1 : 0,
        coachIndex: this.data.coaches.findIndex(c => c._id === s.coachId),
        date: fmt.fullDate(s.startAt),
        time: fmt.hhmm(s.startAt),
        duration: String(s.duration),
        capacity: String(s.capacity),
        room: s.room
      }
    })
  },

  closeForm() {
    this.setData({ editing: false })
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onPick(e) {
    const field = e.currentTarget.dataset.field
    const value = field === 'kindIndex' || field === 'coachIndex' ? Number(e.detail.value) : e.detail.value
    this.setData({ ['form.' + field]: value })
  },

  save() {
    const f = this.data.form
    const coach = this.data.coaches[f.coachIndex]
    if (!coach) return wx.showToast({ title: '请选择教练', icon: 'none' })
    const startAt = new Date(f.date.replace(/-/g, '/') + ' ' + f.time + ':00').getTime()
    api.call('saveSchedule', {
      _id: f._id || undefined,
      courseName: f.courseName,
      kind: KINDS[f.kindIndex].value,
      coachId: coach._id,
      startAt,
      duration: Number(f.duration),
      capacity: Number(f.capacity),
      room: f.room
    }, { loading: '保存中' }).then(() => {
      wx.showToast({ title: '已保存' })
      this.setData({ editing: false, date: f.date })
      this.load()
    })
  },

  cancelSchedule(e) {
    const s = this.data.list[e.currentTarget.dataset.index]
    wx.showModal({
      title: '取消课程',
      content: '取消「' + s.courseName + '」' + s.time + '？已预约的 ' + s.booked + ' 人会被一并取消，请电话通知他们。',
      confirmColor: '#d93a3a',
      success: r => {
        if (!r.confirm) return
        api.call('cancelSchedule', { scheduleId: s._id }, { loading: '处理中' }).then(() => {
          wx.showToast({ title: '已取消' })
          this.load()
        })
      }
    })
  }
})
