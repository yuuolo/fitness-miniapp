// 订阅提醒：一个页面管理所有微信通知（友圈视频 / 竞赛 / 综合评分榜 / 力量排行榜）
//
// 微信规则：一次授权只发一条消息。这里点一次「一键订阅」会把三种模板一次性授权，
// 授权到的每个话题各记一张票；票用完要回来再点一次。
const api = require('../../utils/api')
const subscribe = require('../../utils/subscribe')

const TOPICS = [
  { key: 'moments', name: '友圈新视频', desc: '有人发了带视频的动态' },
  { key: 'competitions', name: '竞赛动态', desc: '新竞赛发布 / 竞赛结束或取消' },
  { key: 'rankScore', name: '综合评分榜', desc: '有人录了体测、评分变了' },
  { key: 'rankLift', name: '力量排行榜', desc: '有人刷新卧推/深蹲等最好成绩' }
]

Page({
  data: {
    topics: [],
    total: 0,
    ready: false,
    challengeSubscribing: false,
    subscribing: false,
    lastError: ''
  },

  onLoad() {
    // 页面一打开就预取模板 ID，保证点按钮时是同步调用
    subscribe.prefetch().then(() => this.setData({ ready: true }))
    this.loadMine()
  },

  onShow() {
    this.loadMine()
  },

  loadMine() {
    return api.call('mySubscriptions', {}, { silent: true }).then(r => {
      const tickets = (r && r.topics) || {}
      const topics = TOPICS.map(t => Object.assign({}, t, { tickets: tickets[t.key] || 0 }))
      const total = topics.reduce((n, t) => n + t.tickets, 0)
      this.setData({ topics, total })
    }, () => {})
  },

  // 挑战提醒（有人挑战你 / 该你判了 / 判定结果）—— 和内容更新分开点，因为微信一次最多 3 个模板
  subscribeChallenge() {
    if (this.data.challengeSubscribing) return
    this.setData({ challengeSubscribing: true, lastError: '' })
    subscribe.requestSync(['invite', 'start', 'result']).then(r => {
      this.setData({ challengeSubscribing: false })
      if (!r || !r.ok) {
        const tip = this.tipOf((r && r.error) || 'unknown')
        this.setData({ lastError: tip })
        wx.showModal({ title: '订阅未成功', content: tip, showCancel: false })
        return
      }
      wx.showToast({ title: '挑战提醒已订阅' })
    })
  },

  // 把错误码翻译成能看懂的话
  tipOf(reason) {
    if (reason === 'not-ready') return '模板还在准备，稍等 2 秒再点一次'
    if (reason === 'rejected') return '你点了“取消”，同意后才能收到通知'
    if (reason === 'no-template') return '后台还没配好通知模板'
    if (/TAP|gesture/i.test(reason)) return '请再点一次按钮（微信要求必须由点击触发）'
    if (/timeout/i.test(reason)) return '微信没响应，请再点一次'
    return '订阅失败：' + reason
  },

  // 一键订阅：一次点击把内容更新的 3 个模板都授权（rankScore / rankLift 共用同一个模板）
  subscribeAll() {
    if (this.data.subscribing) return
    this.setData({ subscribing: true, lastError: '' })
    subscribe.requestTopicsSync(['moments', 'competitions', 'rankScore', 'rankLift']).then(r => {
      this.setData({ subscribing: false })
      const accepted = (r && r.accepted) || []
      if (!accepted.length) {
        const tip = this.tipOf((r && r.error) || 'unknown')
        this.setData({ lastError: tip })
        wx.showModal({ title: '订阅未成功', content: tip, showCancel: false })
        return
      }
      wx.showToast({ title: '订阅成功' })
      this.loadMine()
    })
  },

  // 取消某话题的所有票
  clearTopic(e) {
    const topic = e.currentTarget.dataset.topic
    const name = (TOPICS.find(t => t.key === topic) || {}).name || topic
    wx.showModal({
      title: '停止提醒',
      content: '不再接收「' + name + '」的微信提醒？（已授权的票会保留，但不再累计）',
      success: r => {
        if (!r.confirm) return
        api.call('clearSubscription', { topic }, { silent: true })
          .then(() => this.loadMine())
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }))
      }
    })
  },

  openChallenges() {
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  }
})
