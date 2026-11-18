// 发起挑战：选对手 → 选项目/比法 → 指定教练裁判 → 写上垃圾话
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const memberSearch = require('../../../utils/member-search')
const subscribe = require('../../../utils/subscribe')

Page(Object.assign({}, memberSearch.mixin, {

  data: {
    // 对手
    keyword: '', members: [], memberLoading: false, memberEmpty: false, memberOpen: false,
    opponent: null,
    // 裁判
    referees: [], refereeIndex: -1, refereeOpen: false, referee: null,
    // 项目与比法
    lifts: [], liftIndex: 0,
    metrics: [
      { key: 'absolute', name: '绝对成绩', desc: '直接比重量/次数' },
      { key: 'relative', name: '相对体重', desc: '成绩 ÷ 体重，体重小的不吃亏' }
    ],
    metricIndex: 0,
    trashTalk: '',
    submitting: false
  },

  onLoad() {
    this.memberLimit = 20
    this.fetchMembers()
    api.call('listLiftItems', {}, { silent: true }).then(r => {
      const lifts = (r.items || r || []).filter(x => x.enabled !== false)
      this.setData({ lifts, liftIndex: 0 })
    }, () => {})
    api.call('refereeOptions', {}, { silent: true }).then(list => {
      this.setData({ referees: list || [] })
    }, () => {})
  },

  onUnload() {
    this.stopMemberSearch()
  },

  // ---------- 对手 ----------
  toggleMemberOpen() {
    this.setData({ memberOpen: !this.data.memberOpen })
    if (this.data.memberOpen && !(this.data.members || []).length) this.fetchMembers()
  },
  onKeyword(e) { this.memberInput(e) },
  clearKeyword() { this.clearMemberSearch() },
  pickMember(e) {
    const openid = e.currentTarget.dataset.openid
    const m = (this.data.members || []).find(x => x._id === openid)
    if (!m) return
    this.setData({ opponent: m, memberOpen: false })
  },
  clearOpponent() {
    this.setData({ opponent: null, memberOpen: false })
  },

  // ---------- 裁判 ----------
  toggleReferee() {
    this.setData({ refereeOpen: !this.data.refereeOpen })
  },
  pickReferee(e) {
    const i = Number(e.currentTarget.dataset.index)
    const r = this.data.referees[i]
    if (!r) return
    this.setData({ referee: r, refereeIndex: i, refereeOpen: false })
  },
  clearReferee() {
    this.setData({ referee: null, refereeIndex: -1 })
  },

  // ---------- 其它 ----------
  onLift(e) { this.setData({ liftIndex: Number(e.detail.value) }) },
  onMetric(e) { this.setData({ metricIndex: Number(e.detail.value) }) },
  onTrash(e) { this.setData({ trashTalk: e.detail.value }) },

  submit() {
    const { opponent, referee, lifts, liftIndex, metrics, metricIndex } = this.data
    if (!opponent) return wx.showToast({ title: '先选一个对手', icon: 'none' })
    if (!referee) return wx.showToast({ title: '必须指定一名教练当裁判', icon: 'none' })
    const lift = lifts[liftIndex]
    if (!lift) return wx.showToast({ title: '请选择挑战项目', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    // 先申请订阅授权：同意后，对方的应战 / 判定结果才能推送到微信
    subscribe.requestSync(['invite', 'result']).then(() => api.call('createChallenge', {
      opponent: opponent._id,
      referee: referee._id,
      liftKey: lift.key || lift.name,
      metric: metrics[metricIndex].key,
      trashTalk: this.data.trashTalk
    }, { loading: '发送中' })).then(r => {
      sfx.playSave()
      wx.showToast({ title: '挑战已发出' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/challenges/detail/detail?id=' + r._id })
      }, 500)
    }).catch(err => {
      this.setData({ submitting: false })
      wx.showModal({ title: '发起失败', content: err.message || '请稍后重试', showCancel: false })
    })
  }
}))
