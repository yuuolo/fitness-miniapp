// 挑战详情：双方信息 + 视频 + 裁判判定与理由 + 各角色可做的操作
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const subscribe = require('../../../utils/subscribe')

function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return ''
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? h + ' 小时 ' + (m % 60) + ' 分' : Math.max(1, m) + ' 分钟'
}

Page({
  data: {
    id: '',
    c: null,
    loaded: false,
    countdownText: '',
    // 裁判判定面板
    judgeOpen: false,
    judgeResult: '',
    judgeNote: '',
    cheatOpenid: '',
    results: [
      { key: 'win_challenger', name: '发起方胜' },
      { key: 'win_opponent', name: '应战方胜' },
      { key: 'draw', name: '平局' }
    ],
    // 重新选裁判
    referees: [],
    refereeOpen: false,
    // 评论
    commentText: '',
    sending: false
  },

  onLoad(query) {
    const id = (query || {}).id || ''
    this.setData({ id })
    this.load()
    this.timer = setInterval(() => this.refresh(), 30000)
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  refresh() {
    if (!this.data.c) return
    this.setData({ countdownText: countdown(this.data.c.deadline) })
  },

  load() {
    return api.call('challengeDetail', { id: this.data.id }, { silent: true }).then(c => {
      this.setData({
        c,
        loaded: true,
        countdownText: countdown(c.deadline)
      })
      wx.setNavigationBarTitle({ title: c.liftName + ' · 挑战' })
    }, err => {
      this.setData({ loaded: true })
      wx.showModal({ title: '加载失败', content: err.message || '挑战不存在', showCancel: false })
    })
  },

  // ---------- 应战 / 拒绝 / 否决裁判 ----------
  respond(e) {
    const decision = e.currentTarget.dataset.decision
    const vetoReferee = e.currentTarget.dataset.veto === '1'
    const text = decision === 'decline' ? '确定拒绝这场挑战？'
      : (vetoReferee ? '应战并否决赛判？发起人会重新选裁判。' : '确定应战？记得 2 小时内上传视频。')
    wx.showModal({
      title: decision === 'decline' ? '拒绝挑战' : '应战',
      content: text,
      success: r => {
        if (!r.confirm) return
        subscribe.requestSync(['invite', 'start', 'result'])
          .then(() => api.call('respondChallenge', { id: this.data.id, decision, vetoReferee }, { loading: '处理中' }))
          .then(() => { sfx.playSave(); this.load() })
          .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      }
    })
  },

  // ---------- 裁判接单 / 拒绝 ----------
  refereeAct(e) {
    const decision = e.currentTarget.dataset.decision
    subscribe.requestSync(['invite', 'start', 'result'])
      .then(() => api.call('refereeRespond', { id: this.data.id, decision }, { loading: '处理中' }))
      .then(() => this.load())
      .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  // ---------- 发起人重选裁判 ----------
  toggleRefereePicker() {
    const open = !this.data.refereeOpen
    this.setData({ refereeOpen: open })
    if (open && !this.data.referees.length) {
      api.call('refereeOptions', {}, { silent: true }).then(list => this.setData({ referees: list || [] }), () => {})
    }
  },
  pickReferee(e) {
    const r = this.data.referees[Number(e.currentTarget.dataset.index)]
    if (!r) return
    api.call('pickReferee', { id: this.data.id, referee: r._id }, { loading: '处理中' })
      .then(() => this.setData({ refereeOpen: false }), () => {}).then(() => this.load())
  },

  // ---------- 上传视频（走 /api/video，自动裁切） ----------
  uploadVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      camera: 'back',
      success: res => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        wx.showLoading({ title: '上传中', mask: true })
        subscribe.request(['result']).then(() => api.uploadVideo(file.tempFilePath)).then(v => {
          wx.hideLoading()
          return api.call('submitChallengeVideo', { id: this.data.id, videoUrl: v.fileID }, { silent: true })
            .then(() => {
              sfx.playSave()
              if (v.trimmed) {
                wx.showToast({ title: '已按设定裁到 ' + v.keptSeconds + ' 秒', icon: 'none' })
              } else {
                wx.showToast({ title: '视频已提交' })
              }
              this.load()
            })
        }).catch(err => {
          wx.hideLoading()
          wx.showModal({ title: '视频提交失败', content: err.message || '请稍后重试', showCancel: false })
        })
      }
    })
  },

  playVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }] })
  },

  // ---------- 裁判判定 ----------
  openJudge() {
    const c = this.data.c
    this.setData({
      judgeOpen: !this.data.judgeOpen,
      judgeResult: c.judgeResult || '',
      judgeNote: c.judgeNote || '',
      cheatOpenid: ''
    })
  },
  pickResult(e) {
    this.setData({ judgeResult: e.currentTarget.dataset.key })
  },
  onNote(e) {
    this.setData({ judgeNote: e.detail.value })
  },
  pickCheat(e) {
    const openid = e.currentTarget.dataset.openid
    this.setData({ cheatOpenid: this.data.cheatOpenid === openid ? '' : openid })
  },
  submitJudge() {
    const { judgeResult, judgeNote, cheatOpenid } = this.data
    if (!judgeResult) return wx.showToast({ title: '先选判定结果', icon: 'none' })
    const c = this.data.c
    const cheatName = cheatOpenid === c.challenger.openid ? c.challenger.name : c.opponent.name
    wx.showModal({
      title: '确认判定',
      content: (cheatOpenid ? '将标记「' + cheatName + '」视频作弊（判负 + 禁赛），' : '') +
        '判定后 3 小时内可改判。',
      success: r => {
        if (!r.confirm) return
        api.call('judgeChallenge', {
          id: this.data.id, result: judgeResult, note: judgeNote, cheatOpenid
        }, { loading: '提交中' }).then(() => {
          sfx.playSave()
          this.setData({ judgeOpen: false })
          wx.showToast({ title: '已判定' })
          this.load()
        }).catch(err => wx.showModal({ title: '判定失败', content: err.message || '', showCancel: false }))
      }
    })
  },

  // ---------- 评论 ----------
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  sendComment() {
    const content = String(this.data.commentText || '').trim()
    if (!content || this.data.sending) return
    this.setData({ sending: true })
    api.call('commentChallenge', { id: this.data.id, content }, { silent: true }).then(() => {
      this.setData({ commentText: '', sending: false })
      this.load()
    }, err => {
      this.setData({ sending: false })
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    })
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    api.call('likeChallengeComment', { id }, { silent: true }).then(list => {
      const c = Object.assign({}, this.data.c, {
        comments: list,
        commentCount: (list || []).length
      })
      this.setData({ c })
    }, err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论？',
      success: r => {
        if (!r.confirm) return
        api.call('deleteChallengeComment', { id }, { silent: true }).then(list => {
          const c = Object.assign({}, this.data.c, {
            comments: list,
            commentCount: (list || []).length
          })
          this.setData({ c })
        }, err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  },

  // ---------- 分享 ----------
  onShareAppMessage() {
    const c = this.data.c
    return {
      title: c ? c.challenger.name + ' VS ' + c.opponent.name + ' · ' + c.liftName + '挑战' : '会员挑战',
      path: '/pages/challenges/detail/detail?id=' + this.data.id
    }
  }
})
